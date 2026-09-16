import type { Schema } from '../../data/resource';

export const handler: Schema['adminGetCoolPayBalanceMutation']['functionHandler'] = async (event) => {
  return { balance: 0 };
};