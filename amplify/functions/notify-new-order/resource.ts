import { defineFunction, secret } from "@aws-amplify/backend";

export const notifyNewOrder = defineFunction({
  name: "notify-new-order",
  entry: "./handler.ts",
  timeoutSeconds: 60,
  environment: {
    VAPID_PUBLIC_KEY: secret("VAPID_PUBLIC_KEY"),
    VAPID_PRIVATE_KEY: secret("VAPID_PRIVATE_KEY"),
    FCM_SERVICE_ACCOUNT_KEY: secret("FCM_SERVICE_ACCOUNT_KEY"),
  },
});