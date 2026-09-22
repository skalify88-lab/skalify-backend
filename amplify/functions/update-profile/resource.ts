import { defineFunction } from '@aws-amplify/backend';

export const updateProfile = defineFunction({
  name: 'update-profile',
  entry: './handler.ts',
  resourceGroupName: 'data',
});