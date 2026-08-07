import { Router } from 'express';

import {
  getTesdaCourseOptions,
  getRefundableEnrollments,
  createRefund,
  listRefunds,
  getRefundDetail,
  voidRefund,
  downloadRefundReceipt
} from '../../controllers/Payments/refundsController.js';

import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
import { csrfProtection } from '../../middleware/adminCsrf.js';
import { adminApiRateLimit, readRateLimit } from '../../middleware/adminRateLimit.js';

const router = Router();

// => Rate limit must run before auth middleware so even unauthenticated or
// => forged-token requests get throttled at the door (fixes CodeQL js/missing-rate-limiting)
router.use(adminApiRateLimit);

// => Every route here requires a logged-in admin.
router.use(protectAdmin);

// => Section access must be granted before any refunds data is reachable
router.use(requireSection('payments'));

// => csrfProtection already no-ops on GET/HEAD/OPTIONS internally, so it's
// => safe to apply router-wide instead of per mutating route.
router.use(csrfProtection);

router.get('/course-options', readRateLimit, getTesdaCourseOptions);
router.get('/refundable-enrollments', readRateLimit, getRefundableEnrollments);
router.get('/:publicId', readRateLimit, getRefundDetail);
router.get('/:publicId/receipt', readRateLimit, downloadRefundReceipt);
router.get('/', readRateLimit, listRefunds);

router.post('/', adminApiRateLimit, createRefund);
router.patch('/:publicId/void', adminApiRateLimit, voidRefund);

export default router;