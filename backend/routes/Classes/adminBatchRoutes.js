// => admin/routes/Classes/adminBatchRoutes.js
// => Mirrors routes/Classes/adminFacilityRoutes.js / adminTrainerRoutes.js pattern

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { adminApiRateLimit } from '../../middleware/adminRateLimit.js';
import {
  listActiveBatches,
  searchBatchesController,
  getFormOptions,
  getTesdaBatchDetail,
  getShsBatchDetailController,
  getTesdaBatchLogsController,
  getShsBatchLogsController,
  patchTesdaBatchStatus,
  patchShsBatchStatus,
  createTesdaBatchController,
  createShsBatchController,
  updateTesdaBatchController,
  updateShsBatchController,
  markShsGrade11CompletedController,
  assignTesdaEnrollmentController,
  assignShsEnrollmentController,
} from '../../controllers/Classes/adminBatchController.js';

const router = express.Router();

// => GET /api/admin/batches
router.get('/', adminApiRateLimit, protectAdmin, listActiveBatches);

// => GET /api/admin/batches/search
// => Must be declared BEFORE /tesda/:publicId and /shs/:publicId
router.get('/search', adminApiRateLimit, protectAdmin, searchBatchesController);

// => GET /api/admin/batches/form-options
// => Must also be declared BEFORE the :publicId routes
router.get('/form-options', adminApiRateLimit, protectAdmin, getFormOptions);

// => TESDA batch detail + mutations
router.get('/tesda/:publicId', adminApiRateLimit, protectAdmin, getTesdaBatchDetail);
router.get('/tesda/:publicId/logs', adminApiRateLimit, protectAdmin, getTesdaBatchLogsController);
router.patch('/tesda/:publicId', adminApiRateLimit, protectAdmin, updateTesdaBatchController);
router.patch('/tesda/:publicId/status', adminApiRateLimit, protectAdmin, patchTesdaBatchStatus);
router.patch('/tesda/:publicId/assign-enrollment', adminApiRateLimit, protectAdmin, assignTesdaEnrollmentController);
router.post('/tesda', adminApiRateLimit, protectAdmin, createTesdaBatchController);

// => SHS batch detail + mutations
router.get('/shs/:publicId', adminApiRateLimit, protectAdmin, getShsBatchDetailController);
router.get('/shs/:publicId/logs', adminApiRateLimit, protectAdmin, getShsBatchLogsController);
router.patch('/shs/:publicId', adminApiRateLimit, protectAdmin, updateShsBatchController);
router.patch('/shs/:publicId/status', adminApiRateLimit, protectAdmin, patchShsBatchStatus);
router.patch('/shs/:publicId/grade11-completed', adminApiRateLimit, protectAdmin, markShsGrade11CompletedController);
router.patch('/shs/:publicId/assign-enrollment', adminApiRateLimit, protectAdmin, assignShsEnrollmentController);
router.post('/shs', adminApiRateLimit, protectAdmin, createShsBatchController);

export default router;
