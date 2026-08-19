// => admin/services/Enrollments/sharedEnrollmentService.js
// => Split out of the old adminEnrollmentService.js - holds the combined
//    TESDA + SHS list/search, plus the shared ALLOWED_STATUSES list that
//    both tesdaEnrollmentService.js and shsEnrollmentService.js import,
//    so the status set only has to be maintained in one place.
// => pool is imported here so controllers stay thin

import { pool } from '../../config/db.js';
import { getPendingEnrollments, searchEnrollments, getEnrollmentsByStatus } from '../../models/Enrollments/sharedEnrollmentModel.js';

//
// GET LIST: pending + needs-clarification, combined TESDA + SHS
//
export const fetchPendingEnrollments = async () => {
  return await getPendingEnrollments(pool);
};

//
// SEARCH: across all statuses, combined TESDA + SHS
//
export const searchEnrollmentsService = async (filters) => {
  const hasFilter = Object.values(filters).some(v => v && v.trim());
  if (!hasFilter) throw new Error('At least one search field is required.');
  return searchEnrollments(pool, filters);
};

//
// GET BY STATUS: any single status, paginated 10 rows per page (fixed by
//   the controller) - used for every status besides Pending/Needs
//   Clarification, which stay on fetchPendingEnrollments above
// => Validated against ALLOWED_STATUSES (declared further below in this
//    same file) so an arbitrary/misspelled status can't silently return
//    an empty page with no feedback to the admin
//
export const fetchEnrollmentsByStatus = async (status, page = 1, limit = 10) => {
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const safePage = Math.max(1, page);
  const offset   = (safePage - 1) * limit;

  const { rows, total } = await getEnrollmentsByStatus(pool, status, limit, offset);

  return {
    enrollments: rows,
    pagination: {
      page: safePage,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

//
// STATUS UPDATES - both enrollment types share the same allowed status set
// => Exported so tesdaEnrollmentService.js and shsEnrollmentService.js can
//    both validate against it without duplicating the list
//
export const ALLOWED_STATUSES = [
  'Pending',
  'Reviewed',
  'Approved',
  'Needs Clarification',
  'Rejected',
  'Dropped',
  'For Assessment',
  'Passed Assessment',
  'Failed Assessment',
  'Reserved',
];
