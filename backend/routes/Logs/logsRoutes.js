// => admin/routes/Logs/logsRoutes.js

import express from 'express';
import { getLogs } from '../../controllers/Logs/logsController.js';

const router = express.Router();

// => GET /api/admin/logs -> paginated, filterable activity log list plus filter dropdown data
router.get('/', getLogs);

export default router;
