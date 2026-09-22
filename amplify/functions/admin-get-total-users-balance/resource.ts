import { defineFunction } from '@aws-amplify/backend';

export const adminGetTotalUsersBalance = defineFunction({
  name: 'admin-get-total-users-balance',
  entry: './handler.ts',
  resourceGroupName: 'data',
});