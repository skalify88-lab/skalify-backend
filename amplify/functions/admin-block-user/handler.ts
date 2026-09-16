import type { Schema } from '../../data/resource';

export const handler: Schema['adminBlockUserMutation']['functionHandler'] = async (event) => {
  return { success: false, message: 'Pas encore implémenté' };
};