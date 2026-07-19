// => admin/controllers/adminClassController.js
// => Thin controller layer - delegates all logic to the service
// => Mirrors adminEnrollmentController.js pattern

import {
  fetchActiveClasses,
  fetchClassDetail,
  changeClassStatus,
  addClass,
  searchClassesService,
  fetchClassFormOptions,
} from '../services/adminClassService.js';

// 
// GET /api/admin/classes
// => Returns Ongoing + Planned classes (default list view)
// 
export const listActiveClasses = async (req, res) => {
  try {
    const classes = await fetchActiveClasses();
    return res.status(200).json({ classes });
  } catch (err) {
    console.error('listActiveClasses error:', err);
    return res.status(500).json({ error: 'Failed to fetch classes.' });
  }
};

// 
// GET /api/admin/classes/search
// => Searches classes across all statuses
// => Must be registered BEFORE /:publicId in the router
// 
export const searchClassesController = async (req, res) => {
  const { course_name, instructor_name, status, sector, program_type, track, cluster, start_date_from, start_date_to } = req.query;
  try {
    const results = await searchClassesService({
      course_name, instructor_name, status, sector, program_type, track, cluster, start_date_from, start_date_to,
    });
    return res.json({ classes: results });
  } catch (err) {
    const statusCode = err.message.includes('required') ? 400 : 500;
    return res.status(statusCode).json({ error: err.message });
  }
};

// 
// GET /api/admin/classes/form-options
// => Returns courses, instructors for the Add Class modal
// => Must be registered BEFORE /:publicId to avoid ambiguity
// 
export const getFormOptions = async (req, res) => {
  try {
    const options = await fetchClassFormOptions();
    return res.status(200).json(options);
  } catch (err) {
    console.error('getFormOptions error:', err);
    return res.status(500).json({ error: 'Failed to fetch form options.' });
  }
};

// 
// GET /api/admin/classes/:publicId
// => Full detail bundle: class info + enrolled students
// 
export const getClassDetail = async (req, res) => {
  const { publicId } = req.params;
  try {
    const data = await fetchClassDetail(publicId);
    if (!data) {
      return res.status(404).json({ error: 'Class not found.' });
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error('getClassDetail error:', err);
    return res.status(500).json({ error: 'Failed to fetch class detail.' });
  }
};

// 
// PATCH /api/admin/classes/:publicId/status
// => Body: { status: 'Planned' | 'Ongoing' | 'Concluded' }
// 
export const patchClassStatus = async (req, res) => {
  const { publicId } = req.params;
  const { status }   = req.body;

  if (!status) {
    return res.status(400).json({ error: 'status is required.' });
  }

  try {
    const updated = await changeClassStatus(publicId, status);
    if (!updated) {
      return res.status(404).json({ error: 'Class not found.' });
    }
    return res.status(200).json({ success: true, updated });
  } catch (err) {
    if (err.message?.startsWith('Invalid status')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('patchClassStatus error:', err);
    return res.status(500).json({ error: 'Failed to update class status.' });
  }
};

// 
// POST /api/admin/classes
// => Body: class fields (see service for required list)
// 
export const createClassController = async (req, res) => {
  try {
    // => Attach the creating admin's ID from the JWT payload (set by protectAdmin middleware)
    const classData = { ...req.body, created_by: req.admin?.admin_id ?? null };
    const created = await addClass(classData);
    return res.status(201).json({ success: true, class: created });
  } catch (err) {
    if (err.message.includes('required') || err.message.includes('cannot')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('createClassController error:', err);
    return res.status(500).json({ error: 'Failed to create class.' });
  }
};
