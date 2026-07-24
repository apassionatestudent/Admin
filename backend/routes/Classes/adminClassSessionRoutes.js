// => routes/Classes/adminClassSessionRoutes.js
// => Mirrors adminFacilityRoutes.js pattern

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
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

// => GET /api/admin/class-sessions/facilities
router.get('/facilities', adminApiRateLimit, protectAdmin, listFacilitiesForSessionPicker);

// => GET /api/admin/class-sessions/facilities/:facilityPublicId
router.get('/facilities/:facilityPublicId', adminApiRateLimit, protectAdmin, getFacilitySessionPage);

// => GET /api/admin/class-sessions/facilities/:facilityPublicId/eligible-batches
router.get('/facilities/:facilityPublicId/eligible-batches', adminApiRateLimit, protectAdmin, getEligibleBatches);

// => GET /api/admin/class-sessions/remote?from=&to= (Mobile & Online list)
router.get('/remote', adminApiRateLimit, protectAdmin, listRemoteSessions);

// => GET /api/admin/class-sessions/batch/:batchType/:batchPublicId
router.get('/batch/:batchType/:batchPublicId', adminApiRateLimit, protectAdmin, listSessionsForBatch);

// =>  GET /api/admin/class-sessions/batches (unfiltered, for Mobile/Online modal)
router.get('/batches', adminApiRateLimit, protectAdmin, getRemoteEligibleBatches);

// => POST /api/admin/class-sessions
router.post('/', adminApiRateLimit, protectAdmin, createClassSessionController);

export default router;
