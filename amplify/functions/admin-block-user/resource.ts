import { defineFunction } from '@aws-amplify/backend';

export const adminBlockUser = defineFunction({
  name: 'admin-block-user',
  entry: './handler.ts',
  resourceGroupName: 'data',
});