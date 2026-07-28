import { Router } from 'express';

import {
  getTesdaCourseOptions,
  getEligibleEnrollments,
  createPayment,
  listPayments,
  getPaymentDetail,
  voidPayment
} from '../../controllers/Payments/paymentsController.js';

import { protectAdmin } from '../../middleware/adminAuth.js';
import { csrfProtection } from '../../middleware/adminCsrf.js';
import { adminApiRateLimit, readRateLimit } from '../../middleware/adminRateLimit.js';

const router = Router();

// => Every route here requires a logged-in admin.
router.use(protectAdmin);

// => csrfProtection already no-ops on GET/HEAD/OPTIONS internally, so it's
// => safe to apply router-wide instead of per mutating route.
router.use(csrfProtection);

router.get('/course-options', readRateLimit, getTesdaCourseOptions);
router.get('/eligible-enrollments', readRateLimit, getEligibleEnrollments);
router.get('/:publicId', readRateLimit, getPaymentDetail);
router.get('/', readRateLimit, listPayments);

router.post('/', adminApiRateLimit, createPayment);
router.patch('/:publicId/void', adminApiRateLimit, voidPayment);

export default router;
