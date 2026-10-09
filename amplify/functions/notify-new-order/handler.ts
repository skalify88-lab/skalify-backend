import type { DynamoDBStreamEvent } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { sendPushToMany, type PushTarget } from "../push-sender/sender";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

// Les abonnements (PushSubscription) utilisent le champ owner par défaut d'Amplify,
// au format "<sub>::<username>" — on retrouve ceux du vendeur par suffixe.
async function findSubscriptionsByUsername(username: string): Promise<PushTarget[]> {
  const table = requireEnv("PUSH_SUBSCRIPTION_TABLE_NAME");
  const targets: PushTarget[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;

  do {
    const page = await ddb.send(new ScanCommand({
      TableName: table,
      FilterExpression: "contains(#owner, :suffix)",
      ExpressionAttributeNames: { "#owner": "owner" },
      ExpressionAttributeValues: { ":suffix": `::${username}` },
      ExclusiveStartKey,
    }));
    for (const item of page.Items ?? []) {
      if (typeof item.owner === "string" && item.owner.endsWith(`::${username}`)) {
        targets.push({
          platform: item.platform,
          endpoint: item.endpoint,
          p256dh: item.p256dh,
          authKey: item.authKey,
          fcmToken: item.fcmToken,
        });
      }
    }
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return targets;
}

export const handler = async (event: DynamoDBStreamEvent) => {
  for (const record of event.Records) {
    if (record.eventName !== "INSERT" || !record.dynamodb?.NewImage) continue;

    const order = unmarshall(record.dynamodb.NewImage as any);
    const sellerUsername = order.sellerOwner as string | undefined;
    if (!sellerUsername) continue;

    const targets = await findSubscriptionsByUsername(sellerUsername);
    if (targets.length === 0) continue;

    await sendPushToMany(targets, {
      title: "Nouvelle commande",
      body: `${order.articleName ?? "Un article"} — quantité ${order.quantity ?? 1}`,
      url: "/interface_user/orders/", // ajuste si le vrai chemin diffère
    });
  }
};