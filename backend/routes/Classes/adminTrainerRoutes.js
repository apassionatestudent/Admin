// => routes/Classes/adminTrainerRoutes.js
// => Mirrors adminFacilityRoutes.js pattern

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
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

// => GET /api/admin/trainers
router.get('/', adminApiRateLimit, protectAdmin, requireSection('classes'), listTrainers);

// => GET /api/admin/trainers/deleted
// => Must be declared BEFORE /:publicId, or Express treats 'deleted' as a publicId
router.get('/deleted', adminApiRateLimit, protectAdmin, requireSection('classes'), listDeletedTrainers);

// => POST /api/admin/trainers
router.post('/', adminApiRateLimit, protectAdmin, requireSection('classes'), createTrainerController);

// => GET /api/admin/trainers/:publicId
router.get('/:publicId', adminApiRateLimit, protectAdmin, requireSection('classes'), getTrainerDetailController);

// => PATCH /api/admin/trainers/:publicId
router.patch('/:publicId', adminApiRateLimit, protectAdmin, requireSection('classes'), updateTrainerController);

// => DELETE /api/admin/trainers/:publicId (soft delete)
router.delete('/:publicId', adminApiRateLimit, protectAdmin, requireSection('classes'), deleteTrainerController);

// => POST /api/admin/trainers/:publicId/restore
router.post('/:publicId/restore', adminApiRateLimit, protectAdmin, requireSection('classes'), restoreTrainerController);

export default router;