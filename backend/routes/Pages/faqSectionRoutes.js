// => routes/Pages/faqSectionRoutes.js
// => Mounted at /api/admin/pages/faqs-sections. No csrfProtection here -
//    server.js already applies it globally.

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { adminApiRateLimit, readRateLimit } from '../../middleware/adminRateLimit.js';
import * as faqSectionController from '../../controllers/Pages/faqSectionController.js';

const router = express.Router();

router.get('/', protectAdmin, readRateLimit, faqSectionController.getSections);
router.post('/', protectAdmin, adminApiRateLimit, faqSectionController.createSection);
router.delete('/:publicId', protectAdmin, adminApiRateLimit, faqSectionController.deleteSection);

export default router;