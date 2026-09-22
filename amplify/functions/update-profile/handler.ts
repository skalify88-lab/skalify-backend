import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

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

export const handler = async (event: any) => {
  try {
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader) throw new Error('Non authentifié');
    const token = authHeader.replace('Bearer ', '');
    const payload = await verifier.verify(token);
    const username = payload['cognito:username'] as string;
    const realOwner = `${payload.sub}::${username}`;

    const body = JSON.parse(event.body);
    const { fullName, username: newUsername, phoneNumber, city, region } = body;

    const userProfileTable = requireEnv('USER_PROFILE_TABLE_NAME');

    const scan = await ddb.send(new ScanCommand({
      TableName: userProfileTable,
      FilterExpression: '#owner = :owner',
      ExpressionAttributeNames: { '#owner': 'owner' },
      ExpressionAttributeValues: { ':owner': realOwner },
    }));
    const profile = scan.Items?.[0];
    if (!profile) throw new Error('Profil introuvable');

    // NOUVEAU : ne touche QUE ces cinq attributs, jamais isAdmin/isBlocked/blockedReason/blockedUntil
    const updates: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, any> = {};

    if (fullName !== undefined) { updates.push('#fullName = :fullName'); names['#fullName'] = 'fullName'; values[':fullName'] = fullName; }
    if (newUsername !== undefined) { updates.push('#username = :username'); names['#username'] = 'username'; values[':username'] = newUsername; }
    if (phoneNumber !== undefined) { updates.push('#phoneNumber = :phoneNumber'); names['#phoneNumber'] = 'phoneNumber'; values[':phoneNumber'] = phoneNumber; }
    if (city !== undefined) { updates.push('#city = :city'); names['#city'] = 'city'; values[':city'] = city; }
    if (region !== undefined) { updates.push('#region = :region'); names['#region'] = 'region'; values[':region'] = region; }

    if (updates.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    await ddb.send(new UpdateCommand({
      TableName: userProfileTable,
      Key: { id: profile.id },
      UpdateExpression: `SET ${updates.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }));

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (e: any) {
    return { statusCode: 403, body: JSON.stringify({ success: false, message: e.message }) };
  }
};