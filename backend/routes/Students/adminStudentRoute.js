// => admin/routes/Students/adminStudentRoute.js
// => Mirrors adminClassRoute.js pattern

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
// => Import general admin API rate limiter (relaxed: 200 req / 10 min)
import { adminApiRateLimit } from '../../middleware/adminRateLimit.js';
import {
  listStudents,
  searchStudentsController,
  getStudentDetail,
  patchStudentActive,
  updateStudentController,
  getStudentPaymentHistoryController,
} from '../../controllers/Students/adminStudentController.js';

const router = express.Router();

// => All student routes require a valid admin JWT
// => protectAdmin middleware applied per-route
// => adminApiRateLimit added to satisfy CodeQL CWE-770 (missing rate limiting)

// => GET /api/admin/students
router.get('/', adminApiRateLimit, protectAdmin, listStudents);

// => GET /api/admin/students/search
// => Must be declared BEFORE /:publicId to avoid Express treating 'search' as a publicId
router.get('/search', adminApiRateLimit, protectAdmin, searchStudentsController);

// => GET /api/admin/students/:publicId
router.get('/:publicId', adminApiRateLimit, protectAdmin, getStudentDetail);

// => PATCH /api/admin/students/:publicId/active
// => Body: { is_active: true | false }
router.patch('/:publicId/active', adminApiRateLimit, protectAdmin, patchStudentActive);

// => PUT /api/admin/students/:publicId
// => Body: all editable profile + account fields
router.put('/:publicId', adminApiRateLimit, protectAdmin, updateStudentController);

// => GET /api/admin/students/:publicId/payment-history
router.get('/:publicId/payment-history', adminApiRateLimit, protectAdmin, getStudentPaymentHistoryController);

export default router;
