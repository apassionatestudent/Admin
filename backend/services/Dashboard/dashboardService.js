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

// => sections is req.admin.sections from protectAdmin - null means super_admin
// => (implicit access to everything, see protectAdmin.js), an array means a
// => staff admin scoped to only those section_keys
export const getDashboardSummary = async (sections) => {
    const hasSupportTicketAccess = sections === null || sections.includes('support-tickets');

    // => Enrollment/batch/session counts are not gated, always fetched.
    // => The ticket query only runs at all if the admin has access, so a
    // => restricted staff admin never even triggers that query
    const [enrollmentRows, batchRows, classSessionsToday, ticketRows] = await Promise.all([
        getEnrollmentStatusCounts(),
        getBatchStatusCounts(),
        getClassSessionsTodayCount(),
        hasSupportTicketAccess ? getSupportTicketStatusCounts() : Promise.resolve(null),
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

    // => null (not a zeroed object) is the signal the frontend uses to hide
    // => the Support Tickets card entirely - see DashboardHome.jsx
    const supportTickets = hasSupportTicketAccess
        ? shapeStatusCounts(ticketRows, {
            'Open': 'open',
            'In Progress': 'inProgress',
        })
        : null;

    return {
        enrollments,
        batches,
        classSessionsToday,
        supportTickets,
    };
};