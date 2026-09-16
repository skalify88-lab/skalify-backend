import { defineFunction } from '@aws-amplify/backend';

export const adminSetMaintenanceMode = defineFunction({
  name: 'admin-set-maintenance-mode',
  entry: './handler.ts',
  resourceGroupName: 'data',
});