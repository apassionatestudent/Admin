// => admin/controllers/Enrollments/shsEnrollmentController.js
// => Split out of the old adminEnrollmentController.js - SHS-only
//    handlers, thin controller layer that delegates all logic to
//    shsEnrollmentService.js

import {
  fetchShsEnrollmentDetail,
  changeShsEnrollmentStatus,
  updateShsProfileSection,
  updateShsAddressSection,
  updateShsEnrollmentSection,
  updateShsFamilySection,
  addShsDocumentSection,
  replaceShsDocumentSection,
  deleteShsDocumentSection,
  fetchAvailableShsClasses,
  fetchShsTracksAndClusters,
  fetchShsPaymentHistory,
} from '../../services/Enrollments/shsEnrollmentService.js';

import { uploadToR2 } from '../../middleware/upload.js';

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
    // => external_remarks is forwarded together with status - same
    //    bundling behavior as the TESDA version of this handler
    const updated = await changeShsEnrollmentStatus(publicId, status, external_remarks, req.admin?.admin_id ?? null);
    if (!updated) {
      return res.status(404).json({ error: 'Enrollment not found.' });
    }
    return res.status(200).json({ success: true, updated });
  } catch (err) {
    if (err.message?.startsWith('Invalid status')) {
      return res.status(400).json({ error: err.message });
    }
    // => Reserved-without-batch gate failure - same 400 treatment as TESDA
    if (err.message?.startsWith('Cannot set status to Reserved')) {
      return res.status(400).json({ error: err.message });
    }
    // => Approval-before-Reviewed sequencing failure, and the no-batch-
    //    assigned guard, both start with "Cannot approve" - same 400 treatment
    if (err.message?.startsWith('Cannot approve')) {
      return res.status(400).json({ error: err.message });
    }
    // => Batch-at-capacity failure from approveShsEnrollmentWithLock
    if (err.message?.startsWith('This batch is already full')) {
      return res.status(400).json({ error: err.message });
    }
    // => Missing external remarks on Needs Clarification - same 400 treatment
    if (err.message?.startsWith('External remarks are required')) {
      return res.status(400).json({ error: err.message });
    }
    // => For Assessment gate failure - covers both sequencing and balance
    if (err.message?.startsWith('Cannot set status to "For Assessment"')) {
      return res.status(400).json({ error: err.message });
    }
    // => Failed Assessment sequencing failure
    if (err.message?.startsWith('Cannot set status to "Failed Assessment"')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('patchShsEnrollmentStatus error:', err);
    return res.status(500).json({ error: 'Failed to update status.' });
  }
};

//
// SHS SECTION EDITS
//
export const patchShsProfile = async (req, res) => {
  try {
    const updated = await updateShsProfileSection(req.params.publicId, req.body, req.admin?.admin_id ?? null);
    if (!updated) return res.status(404).json({ error: 'Enrollment not found.' });
    return res.status(200).json({ success: true, profile: updated });
  } catch (err) {
    console.error('patchShsProfile error:', err);
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
};

export const patchShsAddress = async (req, res) => {
  try {
    const updated = await updateShsAddressSection(req.params.publicId, req.body, req.admin?.admin_id ?? null);
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
    const updated = await updateShsEnrollmentSection(req.params.publicId, req.body, req.admin?.admin_id ?? null);
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
    const updated = await updateShsFamilySection(req.params.publicId, members, req.admin?.admin_id ?? null);
    if (!updated) return res.status(404).json({ error: 'Enrollment not found.' });
    return res.status(200).json({ success: true, familyMembers: updated });
  } catch (err) {
    console.error('patchShsFamily error:', err);
    return res.status(500).json({ error: 'Failed to update family members.' });
  }
};

//
// DOCUMENTS - add new / replace existing / delete
// => `upload` middleware (admin's middleware/upload.js) runs first in the
//    route, so req.file is already populated here
//
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

    const doc = await addShsDocumentSection(publicId, { documentType, documentKey: key }, req.admin?.admin_id ?? null);
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

    const doc = await replaceShsDocumentSection(docPublicId, key, req.admin?.admin_id ?? null);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    return res.status(200).json({ success: true, document: doc });
  } catch (err) {
    console.error('patchShsDocument error:', err);
    return res.status(500).json({ error: 'Failed to replace document.' });
  }
};

// => Interprets the tagged { notFound | blocked | deleted } shape from
//    the model - 403 is the actual audit enforcement, not just cosmetic
//    button-hiding on the frontend
export const deleteShsDocumentController = async (req, res) => {
  const { docPublicId } = req.params;
  try {
    const result = await deleteShsDocumentSection(docPublicId, req.admin?.admin_id ?? null);
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

//
// SHS CLASSES + LOOKUPS
//
export const getAvailableShsClassesController = async (req, res) => {
  const { cluster_id } = req.query;
  if (!cluster_id) {
    return res.status(400).json({ error: 'cluster_id is required.' });
  }
  try {
    const classes = await fetchAvailableShsClasses({ clusterId: cluster_id });
    return res.status(200).json({ classes });
  } catch (err) {
    console.error('getAvailableShsClassesController error:', err);
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

//
// GET /api/admin/enrollments/shs/:publicId/payment-history
// => Read-only. Returns { records: [...], batchMiscFeeTotal: number }
//
export const getShsPaymentHistory = async (req, res) => {
  const { publicId } = req.params;
  try {
    const data = await fetchShsPaymentHistory(publicId);
    if (!data) {
      return res.status(404).json({ error: 'Enrollment not found.' });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(data);
  } catch (err) {
    console.error('getShsPaymentHistory error:', err);
    return res.status(500).json({ error: 'Failed to fetch payment history.' });
  }
};
