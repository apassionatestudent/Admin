// => routes/Classes/adminTrainerRoutes.js
// => Mirrors adminFacilityRoutes.js pattern

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
import { csrfProtection } from '../../middleware/adminCsrf.js';
import { adminApiRateLimit } from '../../middleware/adminRateLimit.js';
import {
  listTrainers,
  listDeletedTrainers,
  createTrainerController,
  getTrainerDetailController,
  updateTrainerController,
  deleteTrainerController,
  restoreTrainerController,
} from '../../controllers/Classes/adminTrainerController.js';

const router = express.Router();

// => Applied router-wide so CodeQL's js/missing-csrf-middleware can see it
// => directly attached to this router, not just globally in server.js
router.use(csrfProtection);

router.get('/', adminApiRateLimit, protectAdmin, requireSection('classes'), listTrainers);
router.get('/deleted', adminApiRateLimit, protectAdmin, requireSection('classes'), listDeletedTrainers);
router.post('/', adminApiRateLimit, protectAdmin, requireSection('classes'), createTrainerController);
router.get('/:publicId', adminApiRateLimit, protectAdmin, requireSection('classes'), getTrainerDetailController);
router.patch('/:publicId', adminApiRateLimit, protectAdmin, requireSection('classes'), updateTrainerController);
router.delete('/:publicId', adminApiRateLimit, protectAdmin, requireSection('classes'), deleteTrainerController);
router.post('/:publicId/restore', adminApiRateLimit, protectAdmin, requireSection('classes'), restoreTrainerController);

export default router;