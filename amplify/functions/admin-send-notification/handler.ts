import { CognitoJwtVerifier } from "aws-jwt-verify";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { sendPushToMany, type PushTarget } from "../push-sender/sender";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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

async function findByOwner(table: string, username: string): Promise<Record<string, any> | undefined> {
  let lastKey: Record<string, any> | undefined;
  do {
    const page = await ddb.send(new ScanCommand({
      TableName: table,
      FilterExpression: "contains(#owner, :suffix)",
      ExpressionAttributeNames: { "#owner": "owner" },
      ExpressionAttributeValues: { ":suffix": `::${username}` },
      ExclusiveStartKey: lastKey,
    }));
    const hit = page.Items?.find((i) => typeof i.owner === "string" && i.owner.endsWith(`::${username}`));
    if (hit) return hit;
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return undefined;
}

const reply = (statusCode: number, body: Record<string, any>) => ({ statusCode, body: JSON.stringify(body) });

export const handler = async (event: any) => {
  try {
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader) throw new Error("Non authentifié");
    const token = authHeader.replace("Bearer ", "");
    const payload = await verifier.verify(token);
    const username = payload["cognito:username"] as string;

    const userProfile = await findByOwner(requireEnv("USER_PROFILE_TABLE_NAME"), username);
    if (!userProfile?.isAdmin) {
      return reply(403, { success: false, message: "Accès réservé aux administrateurs" });
    }

    const { title, body } = JSON.parse(event.body);
    if (!title || !body) return reply(400, { success: false, message: "Titre et message requis" });

    const table = requireEnv("PUSH_SUBSCRIPTION_TABLE_NAME");
    const targets: PushTarget[] = [];
    let ExclusiveStartKey: Record<string, any> | undefined;
    do {
      const page = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey }));
      for (const item of page.Items ?? []) {
        targets.push({
          platform: item.platform,
          endpoint: item.endpoint,
          p256dh: item.p256dh,
          authKey: item.authKey,
          fcmToken: item.fcmToken,
        });
      }
      ExclusiveStartKey = page.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    await sendPushToMany(targets, { title, body });
    return reply(200, { success: true, message: `Notification envoyée à ${targets.length} abonné(s)` });
  } catch (e: any) {
    return reply(403, { success: false, message: e.message });
  }
};