// models/Dashboard/dashboardModel.js

import { sql } from '../../config/db.js';

// => Your sql client returns a result object shaped like { rows, rowCount, ... }
// => rather than a plain array, so every query result needs to be unwrapped
// => through this before use. Centralized here so a future driver swap only
// => needs to change one place.
const toRows = (result) => result?.rows ?? result ?? [];

// => Combines TESDA + SHS enrollment counts per status, mirroring how
// => sharedEnrollmentRouter already treats both types as one combined list
export const getEnrollmentStatusCounts = async () => {
    const result = await sql`
        SELECT status, COUNT(*)::int AS count
        FROM (
            SELECT status FROM tesda_enrollments
            UNION ALL
            SELECT status FROM shs_enrollments
        ) AS combined_enrollments
        WHERE status IN ('Pending', 'Needs Clarification', 'Reviewed')
        GROUP BY status
    `;
    return toRows(result);
};

// => Combines TESDA + SHS batch counts per status
export const getBatchStatusCounts = async () => {
    const result = await sql`
        SELECT status, COUNT(*)::int AS count
        FROM (
            SELECT status FROM tesda_batches
            UNION ALL
            SELECT status FROM shs_batches
        ) AS combined_batches
        WHERE status IN ('Pending', 'Ongoing')
        GROUP BY status
    `;
    return toRows(result);
};

// => Combines the anonymous public_support_tickets table with the private,
// => student-scoped support_tickets table. Only ever called by the service
// => after it has confirmed the requesting admin has 'support-tickets' access
export const getSupportTicketStatusCounts = async () => {
    const result = await sql`
        SELECT status, COUNT(*)::int AS count
        FROM (
            SELECT status FROM public_support_tickets
            UNION ALL
            SELECT status FROM support_tickets
        ) AS combined_tickets
        WHERE status IN ('Open', 'In Progress')
        GROUP BY status
    `;
    return toRows(result);
};

// => class_sessions has no TESDA/SHS split at the row level (batch_type is
// => just a column), so today's count is one simple query across all sessions
export const getClassSessionsTodayCount = async () => {
    const result = await sql`
        SELECT COUNT(*)::int AS count
        FROM class_sessions
        WHERE session_date = CURRENT_DATE
    `;
    const rows = toRows(result);
    return rows[0]?.count ?? 0;
};