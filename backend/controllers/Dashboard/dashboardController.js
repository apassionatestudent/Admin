// controllers/Dashboard/dashboardController.js

import { getDashboardSummary } from '../../services/Dashboard/dashboardService.js';

// => GET /api/admin/dashboard/summary
export const getDashboardSummaryController = async (req, res) => {
    try {
        // => req.admin.sections comes from protectAdmin - null for super_admin,
        // => array of section_keys for a scoped staff admin
        const summary = await getDashboardSummary(req.admin.sections);
        res.status(200).json(summary);
    } catch (error) {
        console.error('Error fetching dashboard summary:', error);
        res.status(500).json({ error: 'Failed to load dashboard summary.' });
    }
};