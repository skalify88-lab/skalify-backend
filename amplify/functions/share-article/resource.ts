import { defineFunction } from '@aws-amplify/backend';

export const shareArticle = defineFunction({
  name: 'share-article',
  entry: './handler.ts',
});
