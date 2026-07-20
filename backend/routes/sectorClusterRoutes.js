// => routes/sectorClusterRoutes.js
// => Mount at '/api/admin' in server.js - gives GET/POST/DELETE
// => /api/admin/sectors and /api/admin/clusters, plus /deleted and /restore
// => sub-resources for both. Doesn't collide with your other
// => '/api/admin/enrollments', '/api/admin/classes',
// => '/api/admin/students' mounts since those own different sub-paths.

import express from 'express';
import { protectAdmin } from '../middleware/adminAuth.js';
import { adminApiRateLimit } from '../middleware/adminRateLimit.js';
import {
  getSectors,
  createSector,
  deleteSector,
  getDeletedSectors,
  restoreSector,
  getClusters,
  createCluster,
  deleteCluster,
  getDeletedClusters,
  restoreCluster,
} from '../controllers/sectorClusterController.js';

const router = express.Router();

router.use(protectAdmin);
router.use(adminApiRateLimit);

// => Static sub-path BEFORE ':sectorId', same reasoning as the courses routers
router.get('/sectors/deleted', getDeletedSectors);
router.get('/sectors', getSectors);
router.post('/sectors', createSector);
router.delete('/sectors/:sectorId', deleteSector);
router.post('/sectors/:sectorId/restore', restoreSector);

router.get('/clusters/deleted', getDeletedClusters);
router.get('/clusters', getClusters);
router.post('/clusters', createCluster);
router.delete('/clusters/:clusterId', deleteCluster);
router.post('/clusters/:clusterId/restore', restoreCluster);

export default router;
