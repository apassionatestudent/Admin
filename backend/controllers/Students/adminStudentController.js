// => admin/controllers/Students/adminStudentController.js
// => Thin controller layer - delegates all logic to the service
// => Mirrors adminClassController.js pattern

import {
  fetchStudents,
  searchStudentsService,
  fetchStudentDetail,
  toggleActiveStatus,
  updateStudentRecord,
  fetchStudentPaymentHistory,
  fetchStudentLogs,
  sendPasswordResetLink,
} from '../../services/Students/adminStudentService.js';

// GET /api/admin/students
// => Paginated list, latest first, 10 per page
// => Query param: ?page=1&active=true
export const listStudents = async (req, res) => {
  const { page, active } = req.query;
  try {
    // => active=true from the default list view; absent from search so inactive students show up
    const onlyActive = active === 'true';
    const result = await fetchStudents(page, onlyActive);
    return res.status(200).json(result);
  } catch (err) {
    console.error('listStudents error:', err);
    return res.status(500).json({ error: 'Failed to fetch students.' });
  }
};

// GET /api/admin/students/search
// => Two search modes depending on which params arrive:
// => 1) ?q=sometext        - free-text from the main search bar (ORs name + email)
// => 2) ?last_name=&first_name=&... - individual fields from More Options (ANDed)
// => Must be declared BEFORE /:publicId in the router
export const searchStudentsController = async (req, res) => {
  // => q is the free-text param sent by the main search bar
  // => last_name, first_name, etc. come from More Options panel
  const { q, last_name, first_name, middle_name, name_extension, username, page } = req.query;
  try {
    const results = await searchStudentsService(
      { q, last_name, first_name, middle_name, name_extension, username },
      page
    );
    return res.status(200).json(results);
  } catch (err) {
    const statusCode = err.message.includes('required') ? 400 : 500;
    return res.status(statusCode).json({ error: err.message });
  }
};

// GET /api/admin/students/:publicId
// => Full detail bundle: account + profile + enrollment history
export const getStudentDetail = async (req, res) => {
  const { publicId } = req.params;
  try {
    const data = await fetchStudentDetail(publicId);
    if (!data) {
      return res.status(404).json({ error: 'Student not found.' });
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error('getStudentDetail error:', err);
    return res.status(500).json({ error: 'Failed to fetch student detail.' });
  }
};

// PATCH /api/admin/students/:publicId/active
// => Body: { is_active: true | false }
export const patchStudentActive = async (req, res) => {
  const { publicId }  = req.params;
  const { is_active } = req.body;

  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ error: 'is_active must be a boolean.' });
  }

  try {
    // => actor passed through for activity logging
    const updated = await toggleActiveStatus(publicId, is_active, {
      admin_id: req.admin.admin_id,
      full_name: req.admin.full_name,
    });
    return res.status(200).json({ success: true, updated });
  } catch (err) {
    if (err.message === 'Student not found.') {
      return res.status(404).json({ error: err.message });
    }
    console.error('patchStudentActive error:', err);
    return res.status(500).json({ error: 'Failed to update student status.' });
  }
};


// POST /api/admin/students/:publicId/reset-password
// => Admin-triggered - issues a reset token and emails the student a
//    set-password link. No body required.
export const sendPasswordResetLinkController = async (req, res) => {
  const { publicId } = req.params;
  try {
    const result = await sendPasswordResetLink(publicId, {
      admin_id: req.admin.admin_id,
      full_name: req.admin.full_name,
    });
    return res.status(200).json({ success: true, email: result.email });
  } catch (err) {
    if (err.message === 'Student not found.') {
      return res.status(404).json({ error: err.message });
    }
    console.error('sendPasswordResetLinkController error:', err);
    return res.status(500).json({ error: 'Failed to send password reset link.' });
  }
};

// PUT /api/admin/students/:publicId
// => Body: all editable profile + account fields
export const updateStudentController = async (req, res) => {
  const { publicId } = req.params;
  try {
    // => actor passed through for activity logging
    const result = await updateStudentRecord(publicId, req.body, {
      admin_id: req.admin.admin_id,
      full_name: req.admin.full_name,
    });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    if (err.message.includes('required') || err.message === 'Student not found.') {
      return res.status(400).json({ error: err.message });
    }
    console.error('updateStudentController error:', err);
    return res.status(500).json({ error: 'Failed to update student record.' });
  }
};

// GET /api/admin/students/:publicId/payment-history
// => Read-only. Returns { records: [...] } - lifetime ledger across
//    both TESDA and SHS enrollments for this student.
export const getStudentPaymentHistoryController = async (req, res) => {
  const { publicId } = req.params;
  try {
    const data = await fetchStudentPaymentHistory(publicId);
    if (!data) {
      return res.status(404).json({ error: 'Student not found.' });
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error('getStudentPaymentHistoryController error:', err);
    return res.status(500).json({ error: 'Failed to fetch payment history.' });
  }
};

// GET /api/admin/students/:publicId/logs
// => Read-only. Fetch-all-at-once, no pagination - matches Facilities/
//    Trainers/Support Tickets pattern.
export const getStudentLogsController = async (req, res) => {
  const { publicId } = req.params;
  const { page } = req.query;
  try {
    const result = await fetchStudentLogs(publicId, page);
    if (result === null) {
      return res.status(404).json({ error: 'Student not found.' });
    }
    // => result already has { logs, total, page, limit, totalPages }
    return res.status(200).json(result);
  } catch (err) {
    console.error('getStudentLogsController error:', err);
    return res.status(500).json({ error: 'Failed to fetch student activity logs.' });
  }
};