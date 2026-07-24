// => routes/Classes/adminFacilityRoutes.js
// => Mirrors adminClassRoute.js pattern

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { adminApiRateLimit } from '../../middleware/adminRateLimit.js';
import {
  listFacilities,
  listDeletedFacilities,
  createFacilityController,
  getFacilityDetailController,
  updateFacilityController,
  deleteFacilityController,
  restoreFacilityController,
} from '../../controllers/Classes/adminFacilityController.js';

const router = express.Router();

// => GET /api/admin/facilities
router.get('/', adminApiRateLimit, protectAdmin, listFacilities);

// => GET /api/admin/facilities/deleted
// => Must be declared BEFORE /:publicId, or Express treats 'deleted' as a publicId
router.get('/deleted', adminApiRateLimit, protectAdmin, listDeletedFacilities);

// => POST /api/admin/facilities
router.post('/', adminApiRateLimit, protectAdmin, createFacilityController);

// => GET /api/admin/facilities/:publicId
router.get('/:publicId', adminApiRateLimit, protectAdmin, getFacilityDetailController);

// => PATCH /api/admin/facilities/:publicId
router.patch('/:publicId', adminApiRateLimit, protectAdmin, updateFacilityController);

// => DELETE /api/admin/facilities/:publicId (soft delete)
router.delete('/:publicId', adminApiRateLimit, protectAdmin, deleteFacilityController);

// => POST /api/admin/facilities/:publicId/restore
router.post('/:publicId/restore', adminApiRateLimit, protectAdmin, restoreFacilityController);

export default router;
