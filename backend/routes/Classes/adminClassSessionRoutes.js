// => routes/Classes/adminClassSessionRoutes.js
// => Mirrors adminFacilityRoutes.js pattern

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
import { csrfProtection } from '../../middleware/adminCsrf.js';
import { adminApiRateLimit } from '../../middleware/adminRateLimit.js';
import {
  listFacilitiesForSessionPicker,
  getFacilitySessionPage,
  listRemoteSessions,
  listSessionsForBatch,
  getEligibleBatches,
  getRemoteEligibleBatches,
  createClassSessionController,
  getFacilityActivityLogsController,
  updateClassSessionController,
  cancelClassSessionController,
  createRecurringClassSessionsController,
  getSeriesSessionCountController,
  cancelClassSessionSeriesController,
  updateClassSessionSeriesController,
} from '../../controllers/Classes/adminClassSessionController.js';

const router = express.Router();

// => Applied router-wide so CodeQL's js/missing-csrf-middleware can see it
// => directly attached to this router, not just globally in server.js
router.use(csrfProtection);

router.get('/facilities', adminApiRateLimit, protectAdmin, requireSection('classes'), listFacilitiesForSessionPicker);
router.get('/facilities/:facilityPublicId', adminApiRateLimit, protectAdmin, requireSection('classes'), getFacilitySessionPage);
router.get('/facilities/:facilityPublicId/logs', adminApiRateLimit, protectAdmin, requireSection('classes'), getFacilityActivityLogsController);
router.get('/facilities/:facilityPublicId/eligible-batches', adminApiRateLimit, protectAdmin, requireSection('classes'), getEligibleBatches);
router.get('/remote', adminApiRateLimit, protectAdmin, requireSection('classes'), listRemoteSessions);
router.get('/batch/:batchType/:batchPublicId', adminApiRateLimit, protectAdmin, requireSection('classes'), listSessionsForBatch);
router.get('/batches', adminApiRateLimit, protectAdmin, requireSection('classes'), getRemoteEligibleBatches);
router.post('/', adminApiRateLimit, protectAdmin, requireSection('classes'), createClassSessionController);
// => NEW - repeat-weekly-until creation, kept as its own route rather than
//    overloading POST / with an optional recurrence flag, so the two
//    request shapes (single date vs date range + weekday list) stay separate.
router.post('/recurring', adminApiRateLimit, protectAdmin, requireSection('classes'), createRecurringClassSessionsController);
router.patch('/:sessionPublicId', adminApiRateLimit, protectAdmin, requireSection('classes'), updateClassSessionController);
router.delete('/:sessionPublicId', adminApiRateLimit, protectAdmin, requireSection('classes'), cancelClassSessionController);
// => NEW - "Cancel Entire Series" support. Path shape (/series/:id) never
//    collides with /:sessionPublicId above since that only ever matches a
//    single path segment.
router.get('/series/:recurrenceGroupId/count', adminApiRateLimit, protectAdmin, requireSection('classes'), getSeriesSessionCountController);
router.delete('/series/:recurrenceGroupId', adminApiRateLimit, protectAdmin, requireSection('classes'), cancelClassSessionSeriesController);
router.patch('/series/:recurrenceGroupId', adminApiRateLimit, protectAdmin, requireSection('classes'), updateClassSessionSeriesController);

export default router;