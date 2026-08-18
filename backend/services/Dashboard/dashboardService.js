// services/Dashboard/dashboardService.js

import {
    getEnrollmentStatusCounts,
    getBatchStatusCounts,
    getSupportTicketStatusCounts,
    getClassSessionsTodayCount,
} from '../../models/Dashboard/dashboardModel.js';

// => Turns the raw [{ status, count }] rows into a fixed-shape object with
// => every expected key defaulted to 0, so the frontend never has to guard
// => against a missing key just because a status currently has zero rows
const shapeStatusCounts = (rows, keyMap) => {
    const result = {};
    Object.values(keyMap).forEach((field) => {
        result[field] = 0;
    });

    rows.forEach((row) => {
        const field = keyMap[row.status];
        if (field) {
            result[field] = row.count;
        }
    });

    return result;
};

// => Dashboard summary counts are shown to every admin regardless of section
// => access, since they are plain numbers with no drill-down and no record
// => detail attached. Section restrictions still apply on the actual
// => Enrollments / Classes / Support Tickets pages themselves.
export const getDashboardSummary = async () => {
    const [enrollmentRows, batchRows, classSessionsToday, ticketRows] = await Promise.all([
        getEnrollmentStatusCounts(),
        getBatchStatusCounts(),
        getClassSessionsTodayCount(),
        getSupportTicketStatusCounts(),
    ]);

    const enrollments = shapeStatusCounts(enrollmentRows, {
        'Pending': 'pending',
        'Needs Clarification': 'needsClarification',
        'Reviewed': 'reviewed',
    });

    const batches = shapeStatusCounts(batchRows, {
        'Pending': 'pending',
        'Ongoing': 'ongoing',
    });

    const supportTickets = shapeStatusCounts(ticketRows, {
        'Open': 'open',
        'In Progress': 'inProgress',
    });

    return {
        enrollments,
        batches,
        classSessionsToday,
        supportTickets,
    };
};