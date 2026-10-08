import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event: any) => {
  const id = event?.queryStringParameters?.a as string | undefined;
  const headers = { "Content-Type": "application/json" };

  if (!id) {
    return { statusCode: 200, headers, body: JSON.stringify({ found: false }) };
  }

  try {
    const result = await client.send(
      new GetCommand({
        TableName: process.env.ENTERPRISE_TABLE_NAME,
        Key: { id },
      }),
    );
    const item = result.Item;
    if (!item) {
      return { statusCode: 200, headers, body: JSON.stringify({ found: false }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        found: true,
        name: item.name ?? "",
        description: item.bio ?? "",
        imageKey: item.logoUrl ?? "",
      }),
    };
  } catch (e) {
    return { statusCode: 200, headers, body: JSON.stringify({ found: false }) };
  }
};