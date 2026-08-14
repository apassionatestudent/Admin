// => admin/controllers/Logs/logsController.js

import { fetchLogsPageData } from '../../services/Logs/logsService.js';

// => GET /api/admin/logs
// => Accepts page, pageSize, entityType, actorType, action, search as query params.
//    All filters are optional, missing ones are simply not applied at the model layer.
export const getLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;
    const { entityType, actorType, action, search } = req.query;

    const data = await fetchLogsPageData({ page, pageSize, entityType, actorType, action, search });

    res.json(data);
  } catch (err) {
    console.error('getLogs failed:', err);
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
};
