import { defineFunction, secret } from "@aws-amplify/backend";

export const adminSendNotification = defineFunction({
  name: "admin-send-notification",
  entry: "./handler.ts",
  timeoutSeconds: 120,
  resourceGroupName: "data",
  environment: {
    VAPID_PUBLIC_KEY: secret("VAPID_PUBLIC_KEY"),
    VAPID_PRIVATE_KEY: secret("VAPID_PRIVATE_KEY"),
    FCM_SERVICE_ACCOUNT_KEY: secret("FCM_SERVICE_ACCOUNT_KEY"),
  },
});