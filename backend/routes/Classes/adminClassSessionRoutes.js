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
} from '../../controllers/Classes/adminClassSessionController.js';

const router = express.Router();

// => Applied router-wide so CodeQL's js/missing-csrf-middleware can see it
// => directly attached to this router, not just globally in server.js
router.use(csrfProtection);

router.get('/facilities', adminApiRateLimit, protectAdmin, requireSection('classes'), listFacilitiesForSessionPicker);
router.get('/facilities/:facilityPublicId', adminApiRateLimit, protectAdmin, requireSection('classes'), getFacilitySessionPage);
router.get('/facilities/:facilityPublicId/eligible-batches', adminApiRateLimit, protectAdmin, requireSection('classes'), getEligibleBatches);
router.get('/remote', adminApiRateLimit, protectAdmin, requireSection('classes'), listRemoteSessions);
router.get('/batch/:batchType/:batchPublicId', adminApiRateLimit, protectAdmin, requireSection('classes'), listSessionsForBatch);
router.get('/batches', adminApiRateLimit, protectAdmin, requireSection('classes'), getRemoteEligibleBatches);
router.post('/', adminApiRateLimit, protectAdmin, requireSection('classes'), createClassSessionController);

export default router;