import { CognitoJwtVerifier } from "aws-jwt-verify";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  ScanCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

const verifier = CognitoJwtVerifier.create({
  userPoolId: requireEnv("COGNITO_USER_POOL_ID"),
  tokenUse: "id",
  clientId: requireEnv("COGNITO_CLIENT_ID"),
});

export const handler = async (event: any) => {
  try {
    const authHeader =
      event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader) throw new Error("Non authentifié");
    const token = authHeader.replace("Bearer ", "");
    const payload = await verifier.verify(token);
    const username = payload["cognito:username"] as string;

    const body = JSON.parse(event.body);
    const { orderId } = body;

    const orderTable = requireEnv("ORDER_TABLE_NAME");
    const balanceTable = requireEnv("BALANCE_TABLE_NAME");
    const transactionTable = requireEnv("TRANSACTION_TABLE_NAME");

    const orderResult = await ddb.send(
      new GetCommand({ TableName: orderTable, Key: { id: orderId } }),
    );
    const order = orderResult.Item;
    if (!order) throw new Error("Commande introuvable");

    const isBuyer = order.buyerOwner === username;
    const isSeller = order.sellerOwner === username;
    if (!isBuyer && !isSeller)
      throw new Error("Vous ne faites pas partie de cette commande");

    if (order.status === "COMPLETED") {
      throw new Error(
        "Cette commande est déjà terminée, elle ne peut plus être annulée",
      );
    }

    // Écriture conditionnelle : une seule des deux tentatives simultanées peut réellement passer
    try {
      await ddb.send(
        new UpdateCommand({
          TableName: orderTable,
          Key: { id: orderId },
          UpdateExpression: "SET #status = :rejected",
          ConditionExpression: "#status <> :rejected AND #status <> :completed",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: {
            ":rejected": "REJECTED",
            ":completed": "COMPLETED",
          },
        }),
      );
    } catch (e: any) {
      if (e.name === "ConditionalCheckFailedException") {
        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            orderStatus: "REJECTED",
            alreadyProcessed: true,
          }),
        };
      }
      throw e;
    }

    // Remboursement — même principe, protégé séparément sur buyerRefunded
    if (order.buyerDebited === true && order.buyerRefunded !== true) {
      try {
        await ddb.send(
          new UpdateCommand({
            TableName: orderTable,
            Key: { id: orderId },
            UpdateExpression: "SET buyerRefunded = :true",
            ConditionExpression:
              "attribute_not_exists(buyerRefunded) OR buyerRefunded = :false",
            ExpressionAttributeValues: { ":true": true, ":false": false },
          }),
        );
      } catch (e: any) {
        if (e.name === "ConditionalCheckFailedException") {
          return {
            statusCode: 200,
            body: JSON.stringify({ success: true, orderStatus: "REJECTED" }),
          };
        }
        throw e;
      }

      const total = parseFloat(order.total) || 0;

      const userProfileTable = requireEnv("USER_PROFILE_TABLE_NAME");
      const profileScan = await ddb.send(
        new ScanCommand({
          TableName: userProfileTable,
          FilterExpression: "username = :username",
          ExpressionAttributeValues: { ":username": order.buyerOwner },
        }),
      );
      const buyerProfile = profileScan.Items?.[0];

      if (buyerProfile) {
        const balanceScan = await ddb.send(
          new ScanCommand({
            TableName: balanceTable,
            FilterExpression: "#owner = :owner",
            ExpressionAttributeNames: { "#owner": "owner" },
            ExpressionAttributeValues: { ":owner": buyerProfile.owner },
          }),
        );
        const balance = balanceScan.Items?.[0];

        if (balance) {
          await ddb.send(
            new UpdateCommand({
              TableName: balanceTable,
              Key: { id: balance.id },
              UpdateExpression: "SET amount = :newAmount",
              ExpressionAttributeValues: {
                ":newAmount": (balance.amount ?? 0) + total,
              },
            }),
          );

          await ddb.send(
            new PutCommand({
              TableName: transactionTable,
              Item: {
                id: randomUUID(),
                owner: buyerProfile.owner,
                balanceId: balance.id,
                amount: total,
                type: "CREDIT",
                currency: "XAF",
                reason: `Remboursement : ${order.articleName}`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                __typename: "Transaction",
              },
            }),
          );
        }
      } else {
        console.error(
          `Remboursement impossible : UserProfile introuvable pour ${order.buyerOwner}`,
        );
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, orderStatus: "REJECTED" }),
    };
  } catch (e: any) {
    return {
      statusCode: 403,
      body: JSON.stringify({ success: false, message: e.message }),
    };
  }
};
