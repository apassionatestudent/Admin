// => routes/Classes/adminTrainerRoutes.js
// => Mirrors adminFacilityRoutes.js pattern

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
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
router.get('/', adminApiRateLimit, protectAdmin, listTrainers);

// => GET /api/admin/trainers/deleted
// => Must be declared BEFORE /:publicId, or Express treats 'deleted' as a publicId
router.get('/deleted', adminApiRateLimit, protectAdmin, listDeletedTrainers);

// => POST /api/admin/trainers
router.post('/', adminApiRateLimit, protectAdmin, createTrainerController);

// => GET /api/admin/trainers/:publicId
router.get('/:publicId', adminApiRateLimit, protectAdmin, getTrainerDetailController);

// => PATCH /api/admin/trainers/:publicId
router.patch('/:publicId', adminApiRateLimit, protectAdmin, updateTrainerController);

// => DELETE /api/admin/trainers/:publicId (soft delete)
router.delete('/:publicId', adminApiRateLimit, protectAdmin, deleteTrainerController);

// => POST /api/admin/trainers/:publicId/restore
router.post('/:publicId/restore', adminApiRateLimit, protectAdmin, restoreTrainerController);

export default router;
