// => admin/routes/adminEnrollmentRoute.js

import express from 'express';
import { protectAdmin } from '../middleware/adminAuth.js';
import {
  listPendingEnrollments,
  getEnrollmentDetail,
  patchEnrollmentStatus,
} from '../controllers/adminEnrollmentController.js';
import { adminProxyDocument } from '../controllers/adminDocProxyController.js';

const router = express.Router();

// => All admin enrollment routes require a valid admin JWT
// => protectAdmin middleware is applied to each route individually
// => so the pattern is consistent with how protectStudent is used on the student side

// => GET /api/admin/enrollments
// => List of Pending + Needs Clarification enrollments
router.get('/', protectAdmin, listPendingEnrollments);

// => GET /api/admin/enrollments/:publicId
// => Full detail bundle for one enrollment
// => Must be declared BEFORE /docs/:documentKey to avoid Express ambiguity
router.get('/:publicId', protectAdmin, getEnrollmentDetail);

// => PATCH /api/admin/enrollments/:publicId/status
// => Body: { status: string }
router.patch('/:publicId/status', protectAdmin, patchEnrollmentStatus);

// => GET /api/admin/enrollments/docs/:documentKey
// => Proxy route: streams R2 object to the browser through the server
// => documentKey contains slashes encoded as %2F
// => Declared AFTER /:publicId so Express doesn't swallow 'docs' as a publicId
router.get('/docs/:documentKey', protectAdmin, adminProxyDocument);

export default router;
