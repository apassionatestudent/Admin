// => admin/routes/Classes/adminBatchRoutes.js
// => Mirrors routes/Classes/adminFacilityRoutes.js / adminTrainerRoutes.js pattern

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
import { csrfProtection } from '../../middleware/adminCsrf.js';
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
  getTesdaBatchMiscFeesController,
  getShsBatchMiscFeesController,
  postTesdaBatchMiscFeeController,
  postShsBatchMiscFeeController,
  deleteBatchMiscFeeController,
} from '../../controllers/Classes/adminBatchController.js';

const router = express.Router();

// => Applied router-wide so CodeQL's js/missing-csrf-middleware can see it
// => directly attached to this router, not just globally in server.js
router.use(csrfProtection);

// => GET /api/admin/batches
router.get('/', adminApiRateLimit, protectAdmin, requireSection('classes'), listActiveBatches);

// => GET /api/admin/batches/search
// => Must be declared BEFORE /tesda/:publicId and /shs/:publicId
router.get('/search', adminApiRateLimit, protectAdmin, requireSection('classes'), searchBatchesController);

// => GET /api/admin/batches/form-options
// => Must also be declared BEFORE the :publicId routes
router.get('/form-options', adminApiRateLimit, protectAdmin, requireSection('classes'), getFormOptions);

// => TESDA batch detail + mutations
router.get('/tesda/:publicId', adminApiRateLimit, protectAdmin, requireSection('classes'), getTesdaBatchDetail);
router.get('/tesda/:publicId/logs', adminApiRateLimit, protectAdmin, requireSection('classes'), getTesdaBatchLogsController);
router.patch('/tesda/:publicId', adminApiRateLimit, protectAdmin, requireSection('classes'), updateTesdaBatchController);
router.patch('/tesda/:publicId/status', adminApiRateLimit, protectAdmin, requireSection('classes'), patchTesdaBatchStatus);
router.patch('/tesda/:publicId/assign-enrollment', adminApiRateLimit, protectAdmin, requireSection('classes'), assignTesdaEnrollmentController);
router.post('/tesda', adminApiRateLimit, protectAdmin, requireSection('classes'), createTesdaBatchController);

// => SHS batch detail + mutations
router.get('/shs/:publicId', adminApiRateLimit, protectAdmin, requireSection('classes'), getShsBatchDetailController);
router.get('/shs/:publicId/logs', adminApiRateLimit, protectAdmin, requireSection('classes'), getShsBatchLogsController);
router.patch('/shs/:publicId', adminApiRateLimit, protectAdmin, requireSection('classes'), updateShsBatchController);
router.patch('/shs/:publicId/status', adminApiRateLimit, protectAdmin, requireSection('classes'), patchShsBatchStatus);
router.patch('/shs/:publicId/grade11-completed', adminApiRateLimit, protectAdmin, requireSection('classes'), markShsGrade11CompletedController);
router.patch('/shs/:publicId/assign-enrollment', adminApiRateLimit, protectAdmin, requireSection('classes'), assignShsEnrollmentController);
router.post('/shs', adminApiRateLimit, protectAdmin, requireSection('classes'), createShsBatchController);

// => Miscellaneous fee line items per batch
router.get('/tesda/:publicId/misc-fees', adminApiRateLimit, protectAdmin, requireSection('classes'), getTesdaBatchMiscFeesController);
router.post('/tesda/:publicId/misc-fees', adminApiRateLimit, protectAdmin, requireSection('classes'), postTesdaBatchMiscFeeController);
router.get('/shs/:publicId/misc-fees', adminApiRateLimit, protectAdmin, requireSection('classes'), getShsBatchMiscFeesController);
router.post('/shs/:publicId/misc-fees', adminApiRateLimit, protectAdmin, requireSection('classes'), postShsBatchMiscFeeController);
router.delete('/misc-fees/:feePublicId', adminApiRateLimit, protectAdmin, requireSection('classes'), deleteBatchMiscFeeController);

export default router;