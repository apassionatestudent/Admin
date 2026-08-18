// => routes/Classes/adminFacilityRoutes.js
// => Mirrors adminClassRoute.js pattern

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
import { csrfProtection } from '../../middleware/adminCsrf.js';
import { adminApiRateLimit } from '../../middleware/adminRateLimit.js';
import {
  listFacilities,
  listDeletedFacilities,
  createFacilityController,
  getFacilityDetailController,
  updateFacilityController,
  deleteFacilityController,
  restoreFacilityController,
  getFacilityLogsController,
} from '../../controllers/Classes/adminFacilityController.js';

const router = express.Router();

// => Applied router-wide so CodeQL's js/missing-csrf-middleware can see it
// => directly attached to this router, not just globally in server.js
router.use(csrfProtection);

router.get('/', adminApiRateLimit, protectAdmin, requireSection('classes'), listFacilities);
router.get('/deleted', adminApiRateLimit, protectAdmin, requireSection('classes'), listDeletedFacilities);
router.post('/', adminApiRateLimit, protectAdmin, requireSection('classes'), createFacilityController);
router.get('/:publicId', adminApiRateLimit, protectAdmin, requireSection('classes'), getFacilityDetailController);
router.get('/:publicId/logs', adminApiRateLimit, protectAdmin, requireSection('classes'), getFacilityLogsController);
router.patch('/:publicId', adminApiRateLimit, protectAdmin, requireSection('classes'), updateFacilityController);
router.delete('/:publicId', adminApiRateLimit, protectAdmin, requireSection('classes'), deleteFacilityController);
router.post('/:publicId/restore', adminApiRateLimit, protectAdmin, requireSection('classes'), restoreFacilityController);

export default router;