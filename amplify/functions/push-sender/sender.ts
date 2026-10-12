import webpush from "web-push";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { SSMClient, GetParametersCommand } from "@aws-sdk/client-ssm";



export type PushTarget = {
  platform: "WEB" | "ANDROID";
  endpoint?: string | null;
  p256dh?: string | null;
  authKey?: string | null;
  fcmToken?: string | null;
};

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  orderId?: string;
};

let fcmInitialized = false;

async function ensureFcmInitialized() {
  if (fcmInitialized || getApps().length > 0) {
    fcmInitialized = true;
    return;
  }
  let raw = process.env.FCM_SERVICE_ACCOUNT_KEY;
  if (!raw || raw.startsWith("<value will")) raw = await readSecretFromSsm("FCM_SERVICE_ACCOUNT_KEY");
  if (!raw) throw new Error("FCM_SERVICE_ACCOUNT_KEY introuvable");
  initializeApp({ credential: cert(JSON.parse(raw)) });
  fcmInitialized = true;
}

function ensureWebPushConfigured() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error("Clés VAPID manquantes");
  webpush.setVapidDetails("mailto:contact@s-kalify.com", publicKey, privateKey);
}

async function sendToWeb(target: PushTarget, payload: PushPayload): Promise<boolean> {
  if (!target.endpoint || !target.p256dh || !target.authKey) return false;
  ensureWebPushConfigured();
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.authKey } },
      JSON.stringify({ title: payload.title, body: payload.body, url: payload.url || "/" })
    );
    return true;
  } catch (err: any) {
    console.error("Web push failed", target.endpoint, err?.statusCode || err);
    return false; // 404/410 = abonnement expiré, à ignorer
  }
}

async function sendToAndroid(target: PushTarget, payload: PushPayload): Promise<boolean> {
  if (!target.fcmToken) return false;
  await ensureFcmInitialized();
  try {
    await getMessaging().send({
      token: target.fcmToken,
      data: {
        title: payload.title,
        body: payload.body,
        ...(payload.url ? { url: payload.url } : {}),
        ...(payload.orderId ? { orderId: payload.orderId } : {}),
      },
      android: { priority: "high" },
    });
    return true;
  } catch (err) {
    console.error("FCM push failed", target.fcmToken, err);
    return false;
  }
}

export async function sendPushToTarget(target: PushTarget, payload: PushPayload): Promise<boolean> {
  if (target.platform === "WEB") return sendToWeb(target, payload);
  if (target.platform === "ANDROID") return sendToAndroid(target, payload);
  return false;
}

export async function sendPushToMany(targets: PushTarget[], payload: PushPayload): Promise<void> {
  await Promise.all(targets.map((t) => sendPushToTarget(t, payload)));
}

async function readSecretFromSsm(envName: string): Promise<string | undefined> {
  const rawCfg = process.env.AMPLIFY_SSM_ENV_CONFIG;
  console.log(`[push-sender] AMPLIFY_SSM_ENV_CONFIG=${rawCfg ?? "(absent)"}`); // uniquement des chemins SSM
  if (!rawCfg) return undefined;
  const entry = JSON.parse(rawCfg)[envName];
  const names = [entry?.path, entry?.sharedPath].filter(Boolean) as string[];
  if (!names.length) return undefined;
  const res = await new SSMClient({}).send(new GetParametersCommand({ Names: names, WithDecryption: true }));
  console.log(`[push-sender] SSM found=${JSON.stringify(res.Parameters?.map((p) => p.Name))} invalid=${JSON.stringify(res.InvalidParameters)}`);
  const byName = new Map((res.Parameters ?? []).map((p) => [p.Name, p.Value]));
  return byName.get(entry.path) ?? byName.get(entry.sharedPath);
}