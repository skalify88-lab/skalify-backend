import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

const reply = (statusCode: number, body: Record<string, unknown>, cache = 'no-store') => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache },
  body: JSON.stringify(body),
});

// Renvoie les seules informations publiques d'un article, pour construire l'aperçu d'un lien partagé.
// Appelée par le serveur du site (share/index.php), jamais par le navigateur.
export const handler = async (event: any) => {
  try {
    const id = event.queryStringParameters?.a ?? '';
    if (!ID_PATTERN.test(id)) return reply(400, { found: false });

    const result = await ddb.send(
      new GetCommand({ TableName: requireEnv('ARTICLE_TABLE_NAME'), Key: { id } }),
    );
    const article = result.Item;
    if (!article) return reply(404, { found: false }, 'public, max-age=60');

    const images: unknown[] = Array.isArray(article.images) ? article.images : [];
    const imageKey = String(article.imageUrl || images[0] || '');

    return reply(
      200,
      {
        found: true,
        name: String(article.articleName ?? ''),
        description: String(article.description ?? '').slice(0, 600),
        // Seules les images du dossier public articles/ sont exposées
        imageKey: imageKey.startsWith('articles/') ? imageKey : '',
      },
      'public, max-age=300',
    );
  } catch (e: any) {
    console.error('share-article :', e?.message || e);
    return reply(500, { found: false });
  }
};
