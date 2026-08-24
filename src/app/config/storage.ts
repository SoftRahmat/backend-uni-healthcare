import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "./env.js";

export type PrivateUpload = {
  objectKey: string;
  body: Buffer;
  contentType: string;
};

export interface PrivateObjectStorage {
  upload(input: PrivateUpload): Promise<{ objectKey: string; fileUrl: string }>;
  signedDownload(objectKey: string, expiresInSeconds?: number): Promise<string>;
  delete(objectKey: string): Promise<void>;
}

const explicitCredentials =
  env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
    ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
    : undefined;

const client = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: explicitCredentials,
});

export class S3PrivateObjectStorage implements PrivateObjectStorage {
  async upload(input: PrivateUpload) {
    await client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: input.objectKey,
        Body: input.body,
        ContentType: input.contentType,
        ServerSideEncryption: "AES256",
      }),
    );
    return { objectKey: input.objectKey, fileUrl: `s3://${env.S3_BUCKET}/${input.objectKey}` };
  }

  async signedDownload(objectKey: string, expiresInSeconds = 60 * 60): Promise<string> {
    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: objectKey,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  async delete(objectKey: string): Promise<void> {
    await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: objectKey }));
  }
}

export const privateObjectStorage = new S3PrivateObjectStorage();
