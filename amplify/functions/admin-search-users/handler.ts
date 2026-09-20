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

    const body = JSON.parse(event.body);
    const query: string = body.query ?? '';

    const userProfileTable = requireEnv('USER_PROFILE_TABLE_NAME');

    const scan = await ddb.send(new ScanCommand({
      TableName: userProfileTable,
      FilterExpression: '(contains(username, :q) OR id = :qExact) AND isAdmin <> :trueVal', // NOUVEAU : exclut les admins
      ExpressionAttributeValues: {
        ':q': query,
        ':qExact': query,
        ':trueVal': true,
      },
    }));

    const results = (scan.Items ?? []).map((item) => ({
      id: item.id,
      username: item.username,
      fullName: item.fullName,
      isBlocked: item.isBlocked ?? false,
      blockedReason: item.blockedReason ?? null,
      blockedUntil: item.blockedUntil ?? null,
    }));

    return { statusCode: 200, body: JSON.stringify({ success: true, users: results }) };
  } catch (e: any) {
    return { statusCode: 403, body: JSON.stringify({ success: false, message: e.message }) };
  }
};