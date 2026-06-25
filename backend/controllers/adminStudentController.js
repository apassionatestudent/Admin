// => admin/controllers/adminStudentController.js
// => Thin controller layer - delegates all logic to the service
// => Mirrors adminClassController.js pattern

import {
  fetchStudents,
  searchStudentsService,
  fetchStudentDetail,
  toggleActiveStatus,
  updateStudentRecord,
} from '../services/adminStudentService.js';

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
// => 2) ?surname=&first_name=&... - individual fields from More Options (ANDed)
// => Must be declared BEFORE /:publicId in the router
export const searchStudentsController = async (req, res) => {
  // => q is the free-text param sent by the main search bar
  // => surname, first_name, etc. come from More Options panel
  const { q, surname, first_name, middle_name, name_extension, username, page } = req.query;
  try {
    const results = await searchStudentsService(
      { q, surname, first_name, middle_name, name_extension, username },
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
    const updated = await toggleActiveStatus(publicId, is_active);
    return res.status(200).json({ success: true, updated });
  } catch (err) {
    if (err.message === 'Student not found.') {
      return res.status(404).json({ error: err.message });
    }
    console.error('patchStudentActive error:', err);
    return res.status(500).json({ error: 'Failed to update student status.' });
  }
};

// PUT /api/admin/students/:publicId
// => Body: all editable profile + account fields
export const updateStudentController = async (req, res) => {
  const { publicId } = req.params;
  try {
    const result = await updateStudentRecord(publicId, req.body);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    if (err.message.includes('required') || err.message === 'Student not found.') {
      return res.status(400).json({ error: err.message });
    }
    console.error('updateStudentController error:', err);
    return res.status(500).json({ error: 'Failed to update student record.' });
  }
};
