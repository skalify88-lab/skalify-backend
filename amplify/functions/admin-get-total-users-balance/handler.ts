import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

const verifier = CognitoJwtVerifier.create({
  userPoolId: requireEnv('COGNITO_USER_POOL_ID'),
  tokenUse: 'id',
  clientId: requireEnv('COGNITO_CLIENT_ID'),
});

async function verifyAdmin(authHeader: string | undefined) {
  if (!authHeader) throw new Error('Non authentifié');
  const token = authHeader.replace('Bearer ', '');
  const payload = await verifier.verify(token);
  const username = payload['cognito:username'] as string;

  const userProfileTable = requireEnv('USER_PROFILE_TABLE_NAME');
  const scan = await ddb.send(new ScanCommand({
    TableName: userProfileTable,
    FilterExpression: '#owner = :owner',
    ExpressionAttributeNames: { '#owner': 'owner' },
    ExpressionAttributeValues: { ':owner': `${payload.sub}::${username}` },
  }));
  const profile = scan.Items?.[0];

  if (!profile || profile.isAdmin !== true) {
    throw new Error('Accès refusé : droits administrateur requis');
  }
}

export const handler = async (event: any) => {
  try {
    await verifyAdmin(event.headers?.authorization || event.headers?.Authorization);

    const balanceTable = requireEnv('BALANCE_TABLE_NAME');

    let total = 0;
    let lastEvaluatedKey: Record<string, any> | undefined = undefined;

    do { // NOUVEAU : pagine, au cas où il y aurait beaucoup d'utilisateurs
      const scan = await ddb.send(new ScanCommand({
        TableName: balanceTable,
        ProjectionExpression: 'amount',
        ExclusiveStartKey: lastEvaluatedKey,
      }));

      (scan.Items ?? []).forEach((item) => {
        total += item.amount ?? 0;
      });

      lastEvaluatedKey = scan.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return { statusCode: 200, body: JSON.stringify({ success: true, total }) };
  } catch (e: any) {
    return { statusCode: 403, body: JSON.stringify({ success: false, message: e.message }) };
  }
};