// => admin/controllers/adminEnrollmentController.js
// => Thin controller layer - delegates all logic to the service

import {
  fetchPendingEnrollments,
  fetchEnrollmentDetail,
  changeEnrollmentStatus,
  searchEnrollmentsService 
} from '../services/adminEnrollmentService.js';

// 
// GET /api/admin/enrollments
// => Returns list of Pending + Needs Clarification enrollments
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

// 
// GET /api/admin/enrollments/:publicId
// => Returns full detail bundle: enrollment + student + docs + work exp + trainings
// 
export const getEnrollmentDetail = async (req, res) => {
  const { publicId } = req.params;
  try {
    const data = await fetchEnrollmentDetail(publicId);

    if (!data) {
      return res.status(404).json({ error: 'Enrollment not found.' });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('getEnrollmentDetail error:', err);
    return res.status(500).json({ error: 'Failed to fetch enrollment detail.' });
  }
};

// 
// PATCH /api/admin/enrollments/:publicId/status
// => Body: { status: 'Approved' | 'Rejected' | 'Needs Clarification' | etc. }
// 
export const patchEnrollmentStatus = async (req, res) => {
  const { publicId } = req.params;
  const { status }   = req.body;

  if (!status) {
    return res.status(400).json({ error: 'status is required.' });
  }

  try {
    const updated = await changeEnrollmentStatus(publicId, status);

    if (!updated) {
      return res.status(404).json({ error: 'Enrollment not found.' });
    }

    return res.status(200).json({ success: true, updated });
  } catch (err) {
    // => Service throws a plain Error for invalid status values
    if (err.message?.startsWith('Invalid status')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('patchEnrollmentStatus error:', err);
    return res.status(500).json({ error: 'Failed to update status.' });
  }
};

// => GET /api/admin/enrollments/search
// => Searches enrollments across all statuses by email or name fields
export const searchEnrollmentsController = async (req, res) => {
  const { email, first_name, middle_name, surname, name_extension } = req.query;
  try {
    const results = await searchEnrollmentsService({  // ✅ Remove pool parameter
      email, first_name, middle_name, surname, name_extension,
    });
    res.json({ enrollments: results });
    console.log('searchEnrollmentsController results:', results);
  } catch (err) {
    const status = err.message.includes('required') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
};