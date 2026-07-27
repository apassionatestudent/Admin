// => admin/controllers/Enrollments/tesdaEnrollmentController.js
// => Split out of the old adminEnrollmentController.js - TESDA-only
//    handlers, thin controller layer that delegates all logic to
//    tesdaEnrollmentService.js

import {
  fetchTesdaEnrollmentDetail,
  changeTesdaEnrollmentStatus,
  updateTesdaProfileSection,
  updateTesdaAddressSection,
  updateTesdaGuardianSection,
  updateTesdaEnrollmentSection,
  updateTesdaClassificationsSection,
  addTesdaDocumentSection,
  replaceTesdaDocumentSection,
  deleteTesdaDocumentSection,
  fetchAvailableTesdaClasses,
} from '../../services/Enrollments/tesdaEnrollmentService.js';

import { uploadToR2 } from '../../middleware/upload.js';

//
// GET /api/admin/enrollments/tesda/:publicId
// => Full TESDA detail bundle: enrollment + profile + address + guardian
//    + docs + client classifications
//
export const getTesdaEnrollmentDetail = async (req, res) => {
  const { publicId } = req.params;
  try {
    const data = await fetchTesdaEnrollmentDetail(publicId);
    if (!data) {
      return res.status(404).json({ error: 'Enrollment not found.' });
    }
    res.setHeader('Cache-Control', 'no-store'); // => fetch docs fast, but don't cache them in the browser
    return res.status(200).json(data);
  } catch (err) {
    console.error('getTesdaEnrollmentDetail error:', err);
    return res.status(500).json({ error: 'Failed to fetch enrollment detail.' });
  }
};

//
// PATCH /api/admin/enrollments/tesda/:publicId/status
// => Body: { status: 'Approved' | 'Rejected' | 'Needs Clarification' | etc. }
//
export const patchTesdaEnrollmentStatus = async (req, res) => {
  const { publicId } = req.params;
  const { status, external_remarks } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'status is required.' });
  }

  try {
    // => external_remarks is destructured and forwarded together with
    //    status - keeping both in the same call is what makes the
    //    external remarks bundling behavior work
    const updated = await changeTesdaEnrollmentStatus(publicId, status, external_remarks);
    if (!updated) {
      return res.status(404).json({ error: 'Enrollment not found.' });
    }
    return res.status(200).json({ success: true, updated });
  } catch (err) {
    if (err.message?.startsWith('Invalid status')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('patchTesdaEnrollmentStatus error:', err);
    return res.status(500).json({ error: 'Failed to update status.' });
  }
};

//
// TESDA SECTION EDITS
//
export const patchTesdaProfile = async (req, res) => {
  try {
    const updated = await updateTesdaProfileSection(req.params.publicId, req.body);
    if (!updated) return res.status(404).json({ error: 'Enrollment not found.' });
    return res.status(200).json({ success: true, profile: updated });
  } catch (err) {
    console.error('patchTesdaProfile error:', err);
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
};

export const patchTesdaAddress = async (req, res) => {
  try {
    const updated = await updateTesdaAddressSection(req.params.publicId, req.body);
    if (!updated) return res.status(404).json({ error: 'Enrollment not found.' });
    return res.status(200).json({ success: true, address: updated });
  } catch (err) {
    console.error('patchTesdaAddress error:', err);
    return res.status(500).json({ error: 'Failed to update address.' });
  }
};

export const patchTesdaGuardian = async (req, res) => {
  try {
    const updated = await updateTesdaGuardianSection(req.params.publicId, req.body);
    if (!updated) return res.status(404).json({ error: 'Enrollment not found.' });
    return res.status(200).json({ success: true, guardian: updated });
  } catch (err) {
    console.error('patchTesdaGuardian error:', err);
    return res.status(500).json({ error: 'Failed to update guardian.' });
  }
};

// => Covers Enrollment Info, Class/Batch, NCAE, and Scholarship sections -
//    all four are just columns on tesda_enrollments, so one endpoint
//    handles whichever subset the frontend sends for that section's Save
export const patchTesdaEnrollmentFields = async (req, res) => {
  try {
    const updated = await updateTesdaEnrollmentSection(req.params.publicId, req.body);
    if (!updated) return res.status(404).json({ error: 'Enrollment not found.' });
    return res.status(200).json({ success: true, enrollment: updated });
  } catch (err) {
    console.error('patchTesdaEnrollmentFields error:', err);
    return res.status(500).json({ error: 'Failed to update enrollment.' });
  }
};

// => Body: { classifications: string[], othersText?: string }
export const patchTesdaClassifications = async (req, res) => {
  const { classifications, othersText } = req.body;
  if (!Array.isArray(classifications)) {
    return res.status(400).json({ error: 'classifications must be an array.' });
  }
  try {
    const updated = await updateTesdaClassificationsSection(req.params.publicId, classifications, othersText);
    if (!updated) return res.status(404).json({ error: 'Enrollment not found.' });
    return res.status(200).json({ success: true, classifications: updated });
  } catch (err) {
    console.error('patchTesdaClassifications error:', err);
    return res.status(500).json({ error: 'Failed to update classifications.' });
  }
};

//
// DOCUMENTS - add new / replace existing / delete
// => `upload` middleware (admin's middleware/upload.js) runs first in the
//    route, so req.file is already populated here
//
export const postTesdaDocument = async (req, res) => {
  const { publicId } = req.params;
  const { documentType } = req.body;

  if (!documentType) return res.status(400).json({ error: 'documentType is required.' });
  if (!req.file)      return res.status(400).json({ error: 'No file uploaded.' });

  try {
    const ext = req.file.mimetype === 'application/pdf' ? 'pdf' : 'jpg';
    const key = `primeenroll/admin-uploads/${documentType.replace(/\s+/g, '_')}_${Date.now()}.${ext}`;
    await uploadToR2(req.file.buffer, key, req.file.mimetype);

    const doc = await addTesdaDocumentSection(publicId, { documentType, documentKey: key });
    if (!doc) return res.status(404).json({ error: 'Enrollment not found.' });
    return res.status(201).json({ success: true, document: doc });
  } catch (err) {
    console.error('postTesdaDocument error:', err);
    return res.status(500).json({ error: 'Failed to add document.' });
  }
};

export const patchTesdaDocument = async (req, res) => {
  const { docPublicId } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  try {
    const ext = req.file.mimetype === 'application/pdf' ? 'pdf' : 'jpg';
    const key = `primeenroll/admin-uploads/replace_${Date.now()}.${ext}`;
    await uploadToR2(req.file.buffer, key, req.file.mimetype);

    const doc = await replaceTesdaDocumentSection(docPublicId, key);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    return res.status(200).json({ success: true, document: doc });
  } catch (err) {
    console.error('patchTesdaDocument error:', err);
    return res.status(500).json({ error: 'Failed to replace document.' });
  }
};

// => Interprets the tagged { notFound | blocked | deleted } shape from
//    the model - 403 is the actual audit enforcement, not just cosmetic
//    button-hiding on the frontend
export const deleteTesdaDocumentController = async (req, res) => {
  const { docPublicId } = req.params;
  try {
    const result = await deleteTesdaDocumentSection(docPublicId);
    if (result.notFound) return res.status(404).json({ error: 'Document not found.' });
    if (result.blocked) {
      return res.status(403).json({ error: 'This document was submitted by the student and cannot be deleted. Use Replace instead.' });
    }
    return res.status(200).json({ success: true, public_id: result.deleted.public_id });
  } catch (err) {
    console.error('deleteTesdaDocumentController error:', err);
    return res.status(500).json({ error: 'Failed to delete document.' });
  }
};

//
// TESDA CLASSES
//
export const getAvailableTesdaClassesController = async (req, res) => {
  const { course_id } = req.query;
  if (!course_id) {
    return res.status(400).json({ error: 'course_id is required.' });
  }
  try {
    const classes = await fetchAvailableTesdaClasses({ courseId: course_id });
    return res.status(200).json({ classes });
  } catch (err) {
    console.error('getAvailableTesdaClassesController error:', err);
    return res.status(500).json({ error: 'Failed to fetch available classes.' });
  }
};
