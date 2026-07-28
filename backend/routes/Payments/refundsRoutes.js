import { Router } from 'express';

import {
  getTesdaCourseOptions,
  getRefundableEnrollments,
  createRefund,
  listRefunds,
  getRefundDetail,
  voidRefund
} from '../../controllers/Payments/refundsController.js';

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
router.get('/refundable-enrollments', readRateLimit, getRefundableEnrollments);
router.get('/:publicId', readRateLimit, getRefundDetail);
router.get('/', readRateLimit, listRefunds);

router.post('/', adminApiRateLimit, createRefund);
router.patch('/:publicId/void', adminApiRateLimit, voidRefund);

export default router;
