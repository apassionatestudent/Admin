// => admin/controllers/Enrollments/sharedEnrollmentController.js
// => Split out of the old adminEnrollmentController.js - holds only the
//    combined TESDA + SHS list and search handlers. The R2 doc proxy
//    (adminProxyDocument) stays in its own existing file,
//    controllers/adminDocProxyController.js, and is wired directly in
//    sharedEnrollmentRoute.js.

import {
  fetchPendingEnrollments,
  searchEnrollmentsService,
} from '../../services/Enrollments/sharedEnrollmentService.js';

//
// GET /api/admin/enrollments
// => Returns list of Pending + Needs Clarification enrollments, combined
//    TESDA + SHS with an enrollment_type discriminator on each row
//
export const listPendingEnrollments = async (req, res) => {
  try {
    const enrollments = await fetchPendingEnrollments();
    return res.status(200).json({ enrollments });
  } catch (err) {
    console.error('listPendingEnrollments error:', err);
    return res.status(500).json({ error: 'Failed to fetch enrollments.' });
  }
};

// => GET /api/admin/enrollments/search
// => Searches across all statuses, combined TESDA + SHS
export const searchEnrollmentsController = async (req, res) => {
  const { email, first_name, middle_name, last_name, name_extension } = req.query;
  try {
    const results = await searchEnrollmentsService({
      email, first_name, middle_name, last_name, name_extension,
    });
    return res.json({ enrollments: results });
  } catch (err) {
    const status = err.message.includes('required') ? 400 : 500;
    return res.status(status).json({ error: err.message });
  }
};
