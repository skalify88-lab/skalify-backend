import { defineFunction } from "@aws-amplify/backend";

export const shareEnterprise = defineFunction({
  name: "share-enterprise",
  entry: "./handler.ts",
});