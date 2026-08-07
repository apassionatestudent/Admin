// => routes/Pages/faqRoutes.js
// => Mounted at /api/admin/pages/faqs

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
import { csrfProtection } from '../../middleware/adminCsrf.js';
import { adminApiRateLimit, readRateLimit } from '../../middleware/adminRateLimit.js';
import * as faqController from '../../controllers/Pages/faqController.js';

const router = express.Router();

router.use(csrfProtection);

router.get('/', protectAdmin, requireSection('pages'), readRateLimit, faqController.getFaqs);
router.post('/', protectAdmin, requireSection('pages'), adminApiRateLimit, faqController.createFaq);
router.put('/:publicId', protectAdmin, requireSection('pages'), adminApiRateLimit, faqController.updateFaq);
router.delete('/:publicId', protectAdmin, requireSection('pages'), adminApiRateLimit, faqController.deleteFaq);

export default router;