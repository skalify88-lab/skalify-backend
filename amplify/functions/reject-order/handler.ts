import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  ScanCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

const verifier = CognitoJwtVerifier.create({
  userPoolId: requireEnv('COGNITO_USER_POOL_ID'),
  tokenUse: 'id',
  clientId: requireEnv('COGNITO_CLIENT_ID'),
});

async function findByOwner(table: string, username: string): Promise<Record<string, any> | undefined> {
  let lastKey: Record<string, any> | undefined;
  do {
    const page = await ddb.send(new ScanCommand({
      TableName: table,
      FilterExpression: 'contains(#owner, :suffix)',
      ExpressionAttributeNames: { '#owner': 'owner' },
      ExpressionAttributeValues: { ':suffix': `::${username}` },
      ExclusiveStartKey: lastKey,
    }));
    const hit = page.Items?.find((i) => typeof i.owner === 'string' && i.owner.endsWith(`::${username}`));
    if (hit) return hit;
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return undefined;
}

const reply = (body: Record<string, any>) => ({ statusCode: 200, body: JSON.stringify(body) });

export const handler = async (event: any) => {
  try {
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader) throw new Error('Non authentifié');
    const token = authHeader.replace('Bearer ', '');
    const payload = await verifier.verify(token);
    const username = payload['cognito:username'] as string;

    const { orderId } = JSON.parse(event.body);

    const orderTable = requireEnv('ORDER_TABLE_NAME');
    const balanceTable = requireEnv('BALANCE_TABLE_NAME');
    const transactionTable = requireEnv('TRANSACTION_TABLE_NAME');

    const orderResult = await ddb.send(new GetCommand({ TableName: orderTable, Key: { id: orderId } }));
    const order = orderResult.Item;
    if (!order) throw new Error('Commande introuvable');

    const isBuyer = order.buyerOwner === username;
    const isSeller = order.sellerOwner === username;
    if (!isBuyer && !isSeller) throw new Error('Vous ne faites pas partie de cette commande');

    if (order.status === 'COMPLETED') {
      throw new Error('Cette commande est déjà terminée, elle ne peut plus être annulée');
    }

    // Étape 1 : passage en REJECTED. Idempotent : si elle l'est déjà, on continue,
    // le remboursement est protégé séparément à l'étape 2
    try {
      await ddb.send(new UpdateCommand({
        TableName: orderTable,
        Key: { id: orderId },
        UpdateExpression: 'SET #status = :rejected',
        ConditionExpression: '#status <> :completed',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':rejected': 'REJECTED', ':completed': 'COMPLETED' },
      }));
    } catch (e: any) {
      if (e.name === 'ConditionalCheckFailedException') {
        throw new Error("Cette commande vient d'être terminée, elle ne peut plus être annulée");
      }
      throw e;
    }

    // Étape 2 : remboursement — marquage + crédit + trace, en une seule transaction
    if (order.buyerDebited === true && order.buyerRefunded !== true) {
      const balance = await findByOwner(balanceTable, order.buyerOwner);
      if (!balance) throw new Error("Solde de l'acheteur introuvable — remboursement non effectué");

      const total = parseFloat(order.total) || 0;
      const now = new Date().toISOString();

      try {
        await ddb.send(new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: orderTable,
                Key: { id: orderId },
                UpdateExpression: 'SET buyerRefunded = :true',
                ConditionExpression: 'attribute_not_exists(buyerRefunded) OR buyerRefunded = :false',
                ExpressionAttributeValues: { ':true': true, ':false': false },
              },
            },
            {
              Update: {
                TableName: balanceTable,
                Key: { id: balance.id },
                UpdateExpression: 'SET amount = if_not_exists(amount, :zero) + :delta',
                ExpressionAttributeValues: { ':zero': 0, ':delta': total },
              },
            },
            {
              Put: {
                TableName: transactionTable,
                Item: {
                  id: randomUUID(),
                  owner: balance.owner,
                  balanceId: balance.id,
                  amount: total,
                  type: 'CREDIT',
                  currency: 'XAF',
                  reason: `Remboursement : ${order.articleName}`,
                  createdAt: now,
                  updatedAt: now,
                  __typename: 'Transaction',
                },
              },
            },
          ],
        }));
      } catch (e: any) {
        if (e.name === 'TransactionCanceledException') {
          const codes = (e.CancellationReasons ?? []).map((r: any) => r?.Code);
          if (codes.includes('ConditionalCheckFailed')) {
            return reply({ success: true, orderStatus: 'REJECTED', alreadyProcessed: true });
          }
          throw new Error('Une opération simultanée est en cours, réessayez dans un instant');
        }
        throw e;
      }
    }

    return reply({ success: true, orderStatus: 'REJECTED' });
  } catch (e: any) {
    return { statusCode: 403, body: JSON.stringify({ success: false, message: e.message }) };
  }
};