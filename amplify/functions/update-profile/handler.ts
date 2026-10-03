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

// NOUVEAU : lecture cohérente (l'entreprise vient d'être créée), avec pagination
async function userOwnsEnterprise(username: string): Promise<boolean> {
  const enterpriseTable = requireEnv('ENTERPRISE_TABLE_NAME');
  let lastKey: Record<string, any> | undefined;
  do {
    const page = await ddb.send(new ScanCommand({
      TableName: enterpriseTable,
      FilterExpression: 'ownerUsername = :u',
      ExpressionAttributeValues: { ':u': username },
      ConsistentRead: true,
      ExclusiveStartKey: lastKey,
    }));
    if ((page.Items?.length ?? 0) > 0) return true;
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return false;
}

export const handler = async (event: any) => {
  try {
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader) throw new Error('Non authentifié');
    const token = authHeader.replace('Bearer ', '');
    const payload = await verifier.verify(token);
    const username = payload['cognito:username'] as string;
    const realOwner = `${payload.sub}::${username}`;

    const body = JSON.parse(event.body);
    const { fullName, username: newUsername, phoneNumber, city, region, accountType } = body;

    const userProfileTable = requireEnv('USER_PROFILE_TABLE_NAME');

    const scan = await ddb.send(new ScanCommand({
      TableName: userProfileTable,
      FilterExpression: '#owner = :owner',
      ExpressionAttributeNames: { '#owner': 'owner' },
      ExpressionAttributeValues: { ':owner': realOwner },
    }));
    const profile = scan.Items?.[0];
    if (!profile) throw new Error('Profil introuvable');

    // Ne touche QUE ces attributs, jamais isAdmin/isBlocked/blockedReason/blockedUntil
    const updates: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, any> = {};

    if (fullName !== undefined) { updates.push('#fullName = :fullName'); names['#fullName'] = 'fullName'; values[':fullName'] = fullName; }
    if (newUsername !== undefined) { updates.push('#username = :username'); names['#username'] = 'username'; values[':username'] = newUsername; }
    if (phoneNumber !== undefined) { updates.push('#phoneNumber = :phoneNumber'); names['#phoneNumber'] = 'phoneNumber'; values[':phoneNumber'] = phoneNumber; }
    if (city !== undefined) { updates.push('#city = :city'); names['#city'] = 'city'; values[':city'] = city; }
    if (region !== undefined) { updates.push('#region = :region'); names['#region'] = 'region'; values[':region'] = region; }

    // NOUVEAU : accountType — uniquement ENTREPRISE, et seulement si une entreprise existe pour ce compte
    if (accountType !== undefined) {
      if (accountType !== 'ENTREPRISE') throw new Error('Valeur de accountType non autorisée');
      if (!(await userOwnsEnterprise(username))) throw new Error('Aucune entreprise trouvée pour ce compte');
      updates.push('#accountType = :accountType');
      names['#accountType'] = 'accountType';
      values[':accountType'] = 'ENTREPRISE';
    }

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