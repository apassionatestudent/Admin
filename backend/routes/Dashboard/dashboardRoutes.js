// routes/Dashboard/dashboardRoutes.js

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { readRateLimit } from '../../middleware/adminRateLimit.js';
import { getDashboardSummaryController } from '../../controllers/Dashboard/dashboardController.js';

const router = express.Router();

// => No requireSection here - every admin lands on the Dashboard regardless
// => of section permissions. All summary counts, including Support Tickets,
// => are shown to every admin - see dashboardService.js for the reasoning.
// => readRateLimit matches the /me pattern since this is a read-only route
router.get('/summary', protectAdmin, readRateLimit, getDashboardSummaryController);

export default router;