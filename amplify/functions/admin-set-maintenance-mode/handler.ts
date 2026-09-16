import type { Schema } from '../../data/resource';

export const handler: Schema['adminSetMaintenanceModeMutation']['functionHandler'] = async (event) => {
  return { success: false, message: 'Pas encore implémenté' };
};