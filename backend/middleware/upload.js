// => admin/backend/middleware/upload.js
// => Pure multer middleware - request-handling logic only. R2 client setup
//    and env decoding now live in config/r2.js; re-exported below so every
//    existing controller importing { uploadToR2 } from here keeps working
//    without touching each call site.

import multer from 'multer';
export { r2Client, uploadToR2 } from '../config/r2.js';

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