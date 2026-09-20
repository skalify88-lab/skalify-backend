import { defineFunction } from '@aws-amplify/backend';

export const adminSearchUsers = defineFunction({
  name: 'admin-search-users',
  entry: './handler.ts',
  resourceGroupName: 'data',
});