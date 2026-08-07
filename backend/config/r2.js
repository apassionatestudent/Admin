// => admin/backend/config/r2.js
// => Cloudflare R2 client setup - env variable decoding lives here per
//    convention, mirrors config/email.js's pattern for Resend

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
dotenv.config();

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
} = process.env;

// => R2 uses the S3-compatible API - endpoint follows Cloudflare's format
export const r2Client = new S3Client({
  region: 'auto', // => R2 doesn't use AWS regions; 'auto' is the correct value
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// => Uploads a buffer to R2 and returns the object key
// => The old file in R2 is overwritten if the same key is reused,
// => or a new key is generated if a fresh entry is needed
export const uploadToR2 = async (buffer, key, mimetype) => {
  const command = new PutObjectCommand({
    Bucket:      R2_BUCKET_NAME,
    Key:         key,
    Body:        buffer,
    ContentType: mimetype,
  });

  await r2Client.send(command);

  // => Return only the key - the actual R2 URL is never exposed outside the server
  return key;
};