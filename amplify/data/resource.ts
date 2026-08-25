import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({

  Article: a
      .model({
        articleName: a.string().required(),
        description: a.string().required(),
        enterpriseName: a.string(),
        enterpriseId: a.string(),
        imageUrl: a.string().required(),
        images: a.string().array(),
        userId: a.string().required(),
        articlePrice: a.string().required(),
        category: a.string(),
        colors: a.string().array(),
        sizeType: a.enum(['STANDARD', 'CUSTOM']),
        sizes: a.string().array(),
        shippingPrice: a.string(),
        shippingDuration: a.string(),
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
      city: a.string(),
      region: a.string(),
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
      city: a.string(),
      region: a.string(),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.guest().to(['read']),
      allow.authenticated().to(['read']),
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


    Transaction: a
        .model({
          id: a.id(),
          balanceId: a.string().required(),
          type: a.enum(['CREDIT', 'DEBIT']),
          amount: a.float().required(),
          currency: a.string().default('XAF'),
          reason: a.string(),
          createdAt: a.datetime(),
        })
        .authorization((allow) => [
          allow.owner(),
        ]),


    Wishlist: a
        .model({
          id: a.id(),
          articleId: a.string().required(),
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