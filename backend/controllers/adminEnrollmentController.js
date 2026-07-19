// => admin/controllers/adminEnrollmentController.js
// => FULL REWRITE - thin controller layer, delegates all logic to the service
// => Split into tesda/shs handlers to match the two separate frontend
//    detail components and their /tesda/:publicId, /shs/:publicId routes

import {
  fetchPendingEnrollments,
  searchEnrollmentsService,
  fetchTesdaEnrollmentDetail,
  fetchShsEnrollmentDetail,
  changeTesdaEnrollmentStatus,
  changeShsEnrollmentStatus,
  updateTesdaProfileSection, updateTesdaAddressSection,
  updateTesdaGuardianSection, updateTesdaEnrollmentSection,
  updateTesdaClassificationsSection, updateShsProfileSection,
  updateShsAddressSection, updateShsEnrollmentSection,
  updateShsFamilySection, addTesdaDocumentSection,
  replaceTesdaDocumentSection, addShsDocumentSection,
  replaceShsDocumentSection,
  deleteShsDocumentSection,
  deleteTesdaDocumentSection,
  fetchAvailableShsClasses,
  fetchShsTracksAndClusters,
  fetchAvailableTesdaClasses 
} from '../services/adminEnrollmentService.js';

import { uploadToR2 } from '../middleware/upload.js';

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
  const { email, first_name, middle_name, surname, name_extension } = req.query;
  try {
    const results = await searchEnrollmentsService({
      email, first_name, middle_name, surname, name_extension,
    });
    return res.json({ enrollments: results });
  } catch (err) {
    const status = err.message.includes('required') ? 400 : 500;
    return res.status(status).json({ error: err.message });
  }
};

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
// GET /api/admin/enrollments/shs/:publicId
// => Full SHS detail bundle: enrollment + profile + address + docs +
//    family members
// 
export const getShsEnrollmentDetail = async (req, res) => {
  const { publicId } = req.params;
  try {
    const data = await fetchShsEnrollmentDetail(publicId);
    if (!data) {
      return res.status(404).json({ error: 'Enrollment not found.' });
    }
    res.setHeader('Cache-Control', 'no-store'); // => fetch docs fast, but don't cache them in the browser
    return res.status(200).json(data);
  } catch (err) {
    console.error('getShsEnrollmentDetail error:', err);
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
    // => external_remarks was being destructured but never forwarded -
    //    that's why status saved but the remark silently vanished
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
// PATCH /api/admin/enrollments/shs/:publicId/status
// => Same allowed status set as TESDA, different table under the hood
// 
export const patchShsEnrollmentStatus = async (req, res) => {
  const { publicId } = req.params;
  const { status, external_remarks } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'status is required.' });
  }

  try {
    // => Same fix as TESDA - external_remarks was being read from the
    //    body but never forwarded to the service layer
    const updated = await changeShsEnrollmentStatus(publicId, status, external_remarks);
    if (!updated) {
      return res.status(404).json({ error: 'Enrollment not found.' });
    }
    return res.status(200).json({ success: true, updated });
  } catch (err) {
    if (err.message?.startsWith('Invalid status')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('patchShsEnrollmentStatus error:', err);
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
// SHS SECTION EDITS
// 
export const patchShsProfile = async (req, res) => {
  try {
    const updated = await updateShsProfileSection(req.params.publicId, req.body);
    if (!updated) return res.status(404).json({ error: 'Enrollment not found.' });
    return res.status(200).json({ success: true, profile: updated });
  } catch (err) {
    console.error('patchShsProfile error:', err);
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
};

export const patchShsAddress = async (req, res) => {
  try {
    const updated = await updateShsAddressSection(req.params.publicId, req.body);
    if (!updated) return res.status(404).json({ error: 'Enrollment not found.' });
    return res.status(200).json({ success: true, address: updated });
  } catch (err) {
    console.error('patchShsAddress error:', err);
    return res.status(500).json({ error: 'Failed to update address.' });
  }
};

// => Covers Enrollment Info, Academic Info, Class/Batch, Emergency Contact,
//    Health Info, and Consent sections - all columns on shs_enrollments
export const patchShsEnrollmentFields = async (req, res) => {
  try {
    const updated = await updateShsEnrollmentSection(req.params.publicId, req.body);
    if (!updated) return res.status(404).json({ error: 'Enrollment not found.' });
    return res.status(200).json({ success: true, enrollment: updated });
  } catch (err) {
    console.error('patchShsEnrollmentFields error:', err);
    return res.status(500).json({ error: 'Failed to update enrollment.' });
  }
};

// => Body: { members: [{ role, full_name, occupation?, contact_no?, relationship_to_student? }] }
export const patchShsFamily = async (req, res) => {
  const { members } = req.body;
  if (!Array.isArray(members)) {
    return res.status(400).json({ error: 'members must be an array.' });
  }
  try {
    const updated = await updateShsFamilySection(req.params.publicId, members);
    if (!updated) return res.status(404).json({ error: 'Enrollment not found.' });
    return res.status(200).json({ success: true, familyMembers: updated });
  } catch (err) {
    console.error('patchShsFamily error:', err);
    return res.status(500).json({ error: 'Failed to update family members.' });
  }
};

// 
// DOCUMENTS - add new / replace existing
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

export const postShsDocument = async (req, res) => {
  const { publicId } = req.params;
  const { documentType } = req.body;

  if (!documentType) return res.status(400).json({ error: 'documentType is required.' });
  if (!req.file)      return res.status(400).json({ error: 'No file uploaded.' });

  try {
    // => SHS docs are JPG/PNG only, matching the student-side upload policy
    const ext = req.file.mimetype === 'image/png' ? 'png' : 'jpg';
    const key = `primeenroll/admin-uploads/${documentType.replace(/\s+/g, '_')}_${Date.now()}.${ext}`;
    await uploadToR2(req.file.buffer, key, req.file.mimetype);

    const doc = await addShsDocumentSection(publicId, { documentType, documentKey: key });
    if (!doc) return res.status(404).json({ error: 'Enrollment not found.' });
    return res.status(201).json({ success: true, document: doc });
  } catch (err) {
    console.error('postShsDocument error:', err);
    return res.status(500).json({ error: 'Failed to add document.' });
  }
};

export const patchShsDocument = async (req, res) => {
  const { docPublicId } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  try {
    const ext = req.file.mimetype === 'image/png' ? 'png' : 'jpg';
    const key = `primeenroll/admin-uploads/replace_${Date.now()}.${ext}`;
    await uploadToR2(req.file.buffer, key, req.file.mimetype);

    const doc = await replaceShsDocumentSection(docPublicId, key);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    return res.status(200).json({ success: true, document: doc });
  } catch (err) {
    console.error('patchShsDocument error:', err);
    return res.status(500).json({ error: 'Failed to replace document.' });
  }
};

// Delete SHS document by public_id
// => Now interprets the tagged { notFound | blocked | deleted } shape from
//    the model - 403 is the actual audit enforcement, not just cosmetic
//    button-hiding on the frontend
export const deleteShsDocumentController = async (req, res) => {
  const { docPublicId } = req.params;
  try {
    const result = await deleteShsDocumentSection(docPublicId);
    if (result.notFound) return res.status(404).json({ error: 'Document not found.' });
    if (result.blocked) {
      return res.status(403).json({ error: 'This document was submitted by the student and cannot be deleted. Use Replace instead.' });
    }
    return res.status(200).json({ success: true, public_id: result.deleted.public_id });
  } catch (err) {
    console.error('deleteShsDocumentController error:', err);
    return res.status(500).json({ error: 'Failed to delete document.' });
  }
};

// Delete TESDA document by public_id
// => New - same pattern as deleteShsDocumentController above
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


// SHS Classes
export const getAvailableShsClassesController = async (req, res) => {
  const { track, cluster } = req.query;
  if (!track) {
    return res.status(400).json({ error: 'track is required.' });
  }
  try {
    const classes = await fetchAvailableShsClasses({ track, cluster });
    return res.status(200).json({ classes });
  } catch (err) {
    console.error('getAvailableShsClassesController error:', err);
    return res.status(500).json({ error: 'Failed to fetch available classes.' });
  }
};

// TESDA Classes
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

export const getShsLookupsController = async (req, res) => {
  try {
    const lookups = await fetchShsTracksAndClusters();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(lookups);
  } catch (err) {
    console.error('getShsLookupsController error:', err);
    return res.status(500).json({ error: 'Failed to fetch SHS lookups.' });
  }
};