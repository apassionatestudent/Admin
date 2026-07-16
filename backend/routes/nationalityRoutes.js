// backend/routes/reference.js
import express from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// => Load static reference JSON files
const nationalities = JSON.parse(readFileSync(join(__dirname, '../nationalities.json'), 'utf-8'));

const router = express.Router();

// => GET /api/reference/nationalities
router.get('/nationalities', (req, res) => {
  res.json(nationalities);
});

export default router;