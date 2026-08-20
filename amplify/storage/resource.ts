import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'skalifyArticleImages',
  access: (allow) => ({

    'articles/*': [
      allow.guest.to(['read']),
      allow.authenticated.to(['read', 'write', 'delete']),
    ],

    'profile-photos/{entity_id}/*': [
      allow.authenticated.to(['read']),
      allow.entity('identity').to(['read', 'write', 'delete']),
    ],

    'enterprise-logos/{entity_id}/*': [ // NOUVEAU
      allow.guest.to(['read']),
      allow.authenticated.to(['read']),
      allow.entity('identity').to(['read', 'write', 'delete']),
    ],

    'enterprise-banners/{entity_id}/*': [ // NOUVEAU
      allow.guest.to(['read']),
      allow.authenticated.to(['read']),
      allow.entity('identity').to(['read', 'write', 'delete']),
    ],

  }),
});