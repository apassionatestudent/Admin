// => routes/Reports/reportRoutes.js
import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
import { readRateLimit } from '../../middleware/adminRateLimit.js';
import {
  getSectorsHandler,
  getClustersHandler,
  getTesdaCoursesHandler,
  getShsCoursesHandler,
  getSummaryHandler,
  getOverviewHandler,
} from '../../controllers/Reports/reportController.js';

const router = express.Router();

// => Every route below requires a logged-in admin with access to the
//    'reports' section (already a valid section_key in the admins CHECK
//    constraint, no schema change needed there)
router.use(protectAdmin, requireSection('reports'));

router.get('/sectors',       readRateLimit, getSectorsHandler);
router.get('/clusters',      readRateLimit, getClustersHandler);
router.get('/tesda-courses', readRateLimit, getTesdaCoursesHandler);
router.get('/shs-courses',   readRateLimit, getShsCoursesHandler);
router.get('/summary',       readRateLimit, getSummaryHandler);
router.get('/overview',      readRateLimit, getOverviewHandler);

export default router;