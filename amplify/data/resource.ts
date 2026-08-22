import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({

  Article: a
    .model({
      articleName: a.string().required(),
      description: a.string().required(),
      enterpriseName: a.string(),
      enterpriseId: a.string(),
      imageUrl: a.string().required(),
      userId: a.string().required(),
      articlePrice: a.string().required(),
      createdAt: a.datetime(),
    })
    .authorization((allow) => [
      allow.guest().to(['read']),
      allow.authenticated().to(['read']),
      allow.owner(),
    ]),

    UserProfile: a
    .model({
      id: a.id(),
      username: a.string().required(),
      fullName: a.string().required(),
      phoneNumber: a.string().required(),
      profilePhotoUrl: a.string(),
      accountType: a.enum(['PARTICULIER', 'ENTREPRISE']),
    })
    .authorization((allow) => [
      allow.owner(),
    ]),

    Enterprise: a
    .model({
      id: a.id(),
      name: a.string().required(),
      logoUrl: a.string(),
      bannerUrl: a.string(),
      bio: a.string(),
      phoneNumber: a.string(),
      email: a.string(),
      categories: a.string().array(),
      openingHours: a.string(),
      planRenewalDate: a.datetime(),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.guest().to(['read']),        // profils publics consultables sans connexion
      allow.authenticated().to(['read']), // et par tout utilisateur connecté
    ]),



    Balance: a
        .model({
          id: a.id(),
          amount: a.float().default(0),
          currency: a.string().default('XAF'),
        })
        .authorization((allow) => [
          allow.owner(),
        ]),


});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'identityPool',
  },
});