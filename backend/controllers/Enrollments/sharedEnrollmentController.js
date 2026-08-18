// => admin/controllers/Enrollments/sharedEnrollmentController.js
// => Split out of the old adminEnrollmentController.js - holds only the
//    combined TESDA + SHS list and search handlers. The R2 doc proxy
//    (adminProxyDocument) stays in its own existing file,
//    controllers/adminDocProxyController.js, and is wired directly in
//    sharedEnrollmentRoute.js.

import {
  fetchPendingEnrollments,
  searchEnrollmentsService,
  fetchEnrollmentsByStatus,
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

// => GET /api/admin/enrollments/by-status?status=Approved&page=1
// => Any status besides Pending/Needs Clarification, paginated 10 per page.
//    page defaults to 1 when missing or not a valid number.
export const listEnrollmentsByStatusController = async (req, res) => {
  const { status } = req.query;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = 10; // => fixed page size

  if (!status) {
    return res.status(400).json({ error: 'status is required.' });
  }

  try {
    const data = await fetchEnrollmentsByStatus(status, page, limit);
    return res.status(200).json(data);
  } catch (err) {
    if (err.message?.startsWith('Invalid status')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('listEnrollmentsByStatusController error:', err);
    return res.status(500).json({ error: 'Failed to fetch enrollments.' });
  }
};
