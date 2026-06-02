// => admin/controllers/adminDocProxyController.js
// => Same proxy pattern as documentProxyController.js on the student side
// => Admins stream R2 objects through the server - raw R2 URLs never reach the browser

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2Client } from '../middleware/upload.js';
import dotenv from 'dotenv';
dotenv.config();

const { R2_BUCKET_NAME } = process.env;

// => GET /api/admin/docs/:documentKey
// => documentKey can contain slashes encoded as %2F by the client
export const adminProxyDocument = async (req, res) => {
  const documentKey = decodeURIComponent(req.params.documentKey);

  if (!documentKey) {
    return res.status(400).json({ error: 'Bad request: missing document key.' });
  }

  try {
    // => Server-to-server fetch from R2 using the S3-compatible SDK
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key:    documentKey,
    });

    const r2Response = await r2Client.send(command);

    // => Forward the original Content-Type so the browser renders correctly
    // => e.g. image/jpeg, image/png, application/pdf
    if (r2Response.ContentType) {
      res.setHeader('Content-Type', r2Response.ContentType);
    }

    // => No caching - every request must go through the admin auth check
    res.setHeader('Cache-Control', 'no-store');

    // => Pipe the file stream directly to the HTTP response
    // => Avoids buffering the entire file in memory
    r2Response.Body.pipe(res);

  } catch (err) {
    if (err.name === 'NoSuchKey') {
      return res.status(404).json({ error: 'Document not found in storage.' });
    }
    console.error('Admin doc proxy error:', err);
    return res.status(500).json({ error: 'Internal server error while fetching document.' });
  }
};
