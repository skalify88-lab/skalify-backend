import { defineFunction } from '@aws-amplify/backend';

export const finalizeOrder = defineFunction({
  name: 'finalize-order',
  entry: './handler.ts',
  resourceGroupName: 'data',
});