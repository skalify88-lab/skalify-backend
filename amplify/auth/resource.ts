import { defineAuth, secret } from "@aws-amplify/backend";

export const auth = defineAuth({
  loginWith: {
    email: true,
    externalProviders: {
      google: {
        clientId: secret("GOOGLE_CLIENT_ID"),
        clientSecret: secret("GOOGLE_CLIENT_SECRET"),
        scopes: ["email", "profile", "openid"],
      },
      callbackUrls: [
        "myapp://callback",
        "https://s-kalify.com/interface_user/auth/callback/index.html",
        "http://localhost:5500/interface_user/auth/callback/index.html",
        "http://127.0.0.1:5500/interface_user/auth/callback/index.html",
      ],
      logoutUrls: [
        "myapp://logout",
        "https://s-kalify.com/interface_user/signin/index.html",
        "http://localhost:5500/interface_user/signin/index.html",
        "http://127.0.0.1:5500/interface_user/signin/index.html",
      ],
    },
  },
});
