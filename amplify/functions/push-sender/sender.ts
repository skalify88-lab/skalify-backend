import webpush from "web-push";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

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
};

let fcmInitialized = false;

function ensureFcmInitialized() {
  if (fcmInitialized || getApps().length > 0) {
    fcmInitialized = true;
    return;
  }
  const raw = process.env.FCM_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("FCM_SERVICE_ACCOUNT_KEY manquant");
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
  ensureFcmInitialized();
  try {
    await getMessaging().send({
      token: target.fcmToken,
      notification: { title: payload.title, body: payload.body },
      data: payload.url ? { url: payload.url } : undefined,
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