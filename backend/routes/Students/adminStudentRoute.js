// => admin/routes/Students/adminStudentRoute.js
// => Mirrors adminClassRoute.js pattern

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
import { csrfProtection } from '../../middleware/adminCsrf.js';
import { adminApiRateLimit } from '../../middleware/adminRateLimit.js';
import {
  listStudents,
  searchStudentsController,
  getStudentDetail,
  patchStudentActive,
  updateStudentController,
  getStudentPaymentHistoryController,
  getStudentLogsController,
} from '../../controllers/Students/adminStudentController.js';

const router = express.Router();

// => Applied router-wide so CodeQL's js/missing-csrf-middleware can see it
// => directly attached to this router, not just globally in server.js
router.use(csrfProtection);

router.get('/', adminApiRateLimit, protectAdmin, requireSection('students'), listStudents);
router.get('/search', adminApiRateLimit, protectAdmin, requireSection('students'), searchStudentsController);
router.get('/:publicId', adminApiRateLimit, protectAdmin, requireSection('students'), getStudentDetail);
router.patch('/:publicId/active', adminApiRateLimit, protectAdmin, requireSection('students'), patchStudentActive);
router.put('/:publicId', adminApiRateLimit, protectAdmin, requireSection('students'), updateStudentController);
router.get('/:publicId/payment-history', adminApiRateLimit, protectAdmin, requireSection('students'), getStudentPaymentHistoryController);
router.get('/:publicId/logs', adminApiRateLimit, protectAdmin, requireSection('students'), getStudentLogsController);

export default router;