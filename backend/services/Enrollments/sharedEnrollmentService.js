// => admin/services/Enrollments/sharedEnrollmentService.js
// => Split out of the old adminEnrollmentService.js - holds the combined
//    TESDA + SHS list/search, plus the shared ALLOWED_STATUSES list that
//    both tesdaEnrollmentService.js and shsEnrollmentService.js import,
//    so the status set only has to be maintained in one place.
// => pool is imported here so controllers stay thin

import { pool } from '../../config/db.js';
import { getPendingEnrollments, searchEnrollments } from '../../models/Enrollments/sharedEnrollmentModel.js';

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
// STATUS UPDATES - both enrollment types share the same allowed status set
// => Exported so tesdaEnrollmentService.js and shsEnrollmentService.js can
//    both validate against it without duplicating the list
//
export const ALLOWED_STATUSES = [
  'Pending',
  'Approved',
  'Needs Clarification',
  'Rejected',
  'Dropped',
  'Completed',
  'Reserved',
];
