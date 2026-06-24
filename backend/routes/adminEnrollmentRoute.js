// => admin/routes/adminEnrollmentRoute.js

import express from 'express';
import { protectAdmin } from '../middleware/adminAuth.js';
// => Import general admin API rate limiter (relaxed: 200 req / 10 min)
import { adminApiRateLimit } from '../middleware/adminRateLimit.js';
import {
  listPendingEnrollments,
  getEnrollmentDetail,
  patchEnrollmentStatus,
  searchEnrollmentsController
} from '../controllers/adminEnrollmentController.js';
import { adminProxyDocument } from '../controllers/adminDocProxyController.js';

const router = express.Router();

// => All admin enrollment routes require a valid admin JWT
// => protectAdmin middleware is applied to each route individually
// => adminApiRateLimit added to satisfy CodeQL CWE-770 (missing rate limiting)

// => GET /api/admin/enrollments
router.get('/', adminApiRateLimit, protectAdmin, listPendingEnrollments);

// => Search across all statuses - must be registered before /:publicId
router.get('/search', adminApiRateLimit, protectAdmin, searchEnrollmentsController);

// => GET /api/admin/enrollments/:publicId
// => Must be declared BEFORE /docs/:documentKey to avoid Express ambiguity
router.get('/:publicId', adminApiRateLimit, protectAdmin, getEnrollmentDetail);

// => PATCH /api/admin/enrollments/:publicId/status
// => Body: { status: string }
router.patch('/:publicId/status', adminApiRateLimit, protectAdmin, patchEnrollmentStatus);

// => GET /api/admin/enrollments/docs/:documentKey
// => Proxy route: streams R2 object to the browser through the server
// => documentKey contains slashes encoded as %2F
router.get('/docs/:documentKey', adminApiRateLimit, protectAdmin, adminProxyDocument);

export default router;