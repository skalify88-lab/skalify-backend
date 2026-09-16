import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

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
    const { enabled, message } = body;

    const appConfigTable = requireEnv('APP_CONFIG_TABLE_NAME');

    // Une seule ligne en base — on la cherche, on la crée si elle n'existe pas encore
    const scan = await ddb.send(new ScanCommand({ TableName: appConfigTable }));
    const existing = scan.Items?.[0];

    if (existing) {
      await ddb.send(new UpdateCommand({
        TableName: appConfigTable,
        Key: { id: existing.id },
        UpdateExpression: 'SET maintenanceMode = :mode, maintenanceMessage = :msg',
        ExpressionAttributeValues: { ':mode': enabled, ':msg': message ?? null },
      }));
    } else {
      await ddb.send(new PutCommand({
        TableName: appConfigTable,
        Item: {
          id: randomUUID(),
          maintenanceMode: enabled,
          maintenanceMessage: message ?? null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          __typename: 'AppConfig',
        },
      }));
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (e: any) {
    return { statusCode: 403, body: JSON.stringify({ success: false, message: e.message }) };
  }
};