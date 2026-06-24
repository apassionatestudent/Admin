// => admin/routes/adminClassRoute.js
// => Mirrors adminEnrollmentRoute.js pattern

import express from 'express';
import { protectAdmin } from '../middleware/adminAuth.js';
// => Import general admin API rate limiter (relaxed: 200 req / 10 min)
import { adminApiRateLimit } from '../middleware/adminRateLimit.js';
import {
  listActiveClasses,
  searchClassesController,
  getFormOptions,
  getClassDetail,
  patchClassStatus,
  createClassController,
} from '../controllers/adminClassController.js';

const router = express.Router();

// => All class routes require a valid admin JWT
// => protectAdmin middleware is applied to each route individually
// => adminApiRateLimit added to satisfy CodeQL CWE-770 (missing rate limiting)

// => GET /api/admin/classes
router.get('/', adminApiRateLimit, protectAdmin, listActiveClasses);

// => GET /api/admin/classes/search
// => Must be declared BEFORE /:publicId to avoid Express treating 'search' as a publicId
router.get('/search', adminApiRateLimit, protectAdmin, searchClassesController);

// => GET /api/admin/classes/form-options
// => Must also be declared BEFORE /:publicId
router.get('/form-options', adminApiRateLimit, protectAdmin, getFormOptions);

// => GET /api/admin/classes/:publicId
router.get('/:publicId', adminApiRateLimit, protectAdmin, getClassDetail);

// => PATCH /api/admin/classes/:publicId/status
// => Body: { status: 'Planned' | 'Ongoing' | 'Concluded' }
router.patch('/:publicId/status', adminApiRateLimit, protectAdmin, patchClassStatus);

// => POST /api/admin/classes
// => Body: all required class fields
router.post('/', adminApiRateLimit, protectAdmin, createClassController);

export default router;