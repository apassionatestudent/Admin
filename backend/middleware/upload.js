// => admin/backend/middleware/upload.js
// => Handles R2 client setup and file upload for admin use
// => Admins can replace/upload documents on behalf of students

import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
dotenv.config();

// => Same env variable pattern as the student backend's upload.js
const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
} = process.env;

// => R2 uses the S3-compatible API - endpoint follows Cloudflare's format
// => Matches exactly how r2Client is constructed in the student upload.js
export const r2Client = new S3Client({
  region: 'auto', // => R2 doesn't use AWS regions; 'auto' is the correct value
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// => memoryStorage keeps files as buffers in RAM instead of writing to disk
// => Required so we can pass the buffer directly to R2
const storage = multer.memoryStorage();

// => Only accept JPG, PNG, and PDF - same policy as the student side
const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, and PDF files are allowed.'), false);
  }
};

// => Single-field upload for admin document replacement
// => 'document' is the field name the admin frontend sends when replacing a file
export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // => 5MB limit per file
}).single('document');

// => Uploads a buffer to R2 and returns the object key
// => Reuses the same key format as the student side for consistency
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