import { defineFunction } from "@aws-amplify/backend";

export const rejectOrder = defineFunction({
  name: "reject-order",
  entry: "./handler.ts",
});
