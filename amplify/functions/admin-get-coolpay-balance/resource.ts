import { defineFunction } from '@aws-amplify/backend';

export const adminGetCoolPayBalance = defineFunction({
  name: 'admin-get-coolpay-balance',
  entry: './handler.ts',
  resourceGroupName: 'data',
});