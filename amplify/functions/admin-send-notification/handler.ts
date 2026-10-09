import type { Handler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { sendPushToMany, type PushTarget } from "../push-sender/sender";

const client = DynamoDBDocumentClient.from(new DynamoDBClient());

type Args = { title: string; body: string };

export const handler: Handler<{ arguments: Args }> = async (event) => {
  const { title, body } = event.arguments;
  const tableName = process.env.PUSH_SUBSCRIPTION_TABLE_NAME;
  if (!tableName) return { success: false, message: "Table PushSubscription introuvable" };

  const targets: PushTarget[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;

  do {
    const result = await client.send(new ScanCommand({ TableName: tableName, ExclusiveStartKey }));
    for (const item of result.Items ?? []) {
      targets.push({
        platform: item.platform,
        endpoint: item.endpoint,
        p256dh: item.p256dh,
        authKey: item.authKey,
        fcmToken: item.fcmToken,
      });
    }
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  await sendPushToMany(targets, { title, body });
  return { success: true, message: `Notification envoyée à ${targets.length} abonné(s)` };
};