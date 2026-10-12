import type { DynamoDBStreamEvent } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { sendPushToMany, type PushTarget } from "../push-sender/sender";
import { env } from "$amplify/env/notify-new-order";



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
    console.log(`[notifyNewOrder] scan page: ${page.Items?.length ?? 0} items, table=${table}, suffix=::${username}`);
    for (const item of page.Items ?? []) {
      console.log(`[notifyNewOrder] candidate owner="${item.owner}"`);
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
  process.env.FCM_SERVICE_ACCOUNT_KEY = env.FCM_SERVICE_ACCOUNT_KEY;
  process.env.VAPID_PUBLIC_KEY = env.VAPID_PUBLIC_KEY;
  process.env.VAPID_PRIVATE_KEY = env.VAPID_PRIVATE_KEY;

  console.log(`[notifyNewOrder] event received, ${event.Records.length} record(s)`);

  for (const record of event.Records) {
    console.log(`[notifyNewOrder] record eventName=${record.eventName}`);

    if (record.eventName !== "INSERT" || !record.dynamodb?.NewImage) {
      console.log("[notifyNewOrder] skip: not an INSERT or missing NewImage");
      continue;
    }

    const order = unmarshall(record.dynamodb.NewImage as any);
    console.log("[notifyNewOrder] order payload:", JSON.stringify(order));

    const sellerUsername = order.sellerOwner as string | undefined;
    console.log(`[notifyNewOrder] sellerUsername="${sellerUsername}"`);

    if (!sellerUsername) {
      console.log("[notifyNewOrder] skip: order.sellerOwner is missing/undefined");
      continue;
    }

    const targets = await findSubscriptionsByUsername(sellerUsername);
    console.log(`[notifyNewOrder] found ${targets.length} target(s)`);

    if (targets.length === 0) {
      console.log("[notifyNewOrder] skip: no matching PushSubscription for this seller");
      continue;
    }

    try {
      const total = Math.round(Number(order.total) || 0)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ".");

      const result = await sendPushToMany(targets, {
        title: `Commande #${String(order.id).slice(0, 8).toUpperCase()}`,
        body: `${total} FCFA — Quantité : ${order.quantity ?? 1} — ${order.articleName ?? "Article"} • de ${order.buyerName ?? "un client"}`,
        url: `/interface_user/commande-details/index.html?id=${encodeURIComponent(order.id)}`,
        orderId: String(order.id),
      });
      console.log("[notifyNewOrder] sendPushToMany result:", JSON.stringify(result));
    } catch (err) {
      console.error("[notifyNewOrder] sendPushToMany threw:", err);
    }
  }
};
