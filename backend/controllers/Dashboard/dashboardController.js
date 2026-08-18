// controllers/Dashboard/dashboardController.js

import { getDashboardSummary } from '../../services/Dashboard/dashboardService.js';

// => GET /api/admin/dashboard/summary
export const getDashboardSummaryController = async (req, res) => {
    try {
        // => Dashboard summary is unscoped by section access - see
        // => dashboardService.js for the reasoning
        const summary = await getDashboardSummary();
        res.status(200).json(summary);
    } catch (error) {
        console.error('Error fetching dashboard summary:', error);
        res.status(500).json({ error: 'Failed to load dashboard summary.' });
    }
};