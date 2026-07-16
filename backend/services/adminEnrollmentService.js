// => admin/services/adminEnrollmentService.js
// => FULL REWRITE - mirrors adminClassService.js pattern
// => pool is imported here so controllers stay thin

import { pool } from '../config/db.js';

import {
  getPendingEnrollments,
  searchEnrollments,
  getTesdaEnrollmentDetailByPublicId,
  getShsEnrollmentDetailByPublicId,
  getProfileByStudentId,
  getAddressByStudentId,
  getGuardianByStudentId,
  getTesdaDocsByEnrollmentId,
  getClassificationsByEnrollmentId,
  getShsDocsByEnrollmentId,
  getFamilyMembersByStudentId,
  updateTesdaEnrollmentStatus,
  updateShsEnrollmentStatus,
  updateProfile, updateAddress, upsertGuardian,
  updateTesdaEnrollmentFields, updateShsEnrollmentFields,
  replaceClassifications, replaceFamilyMembers,
  addTesdaDocument, replaceTesdaDocument,
  addShsDocument, replaceShsDocument,
  deleteShsDocument, deleteTesdaDocument, getAvailableShsClasses,
  getAvailableTesdaClasses,
  getShsTracksAndClusters,
  getClusterCourses 
} from '../models/adminEnrollmentModel.js';

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
// TESDA DETAIL: enrollment + shared profile/address/guardian + TESDA-only
//   docs and client classifications, assembled into one response bundle
// 
export const fetchTesdaEnrollmentDetail = async (publicId) => {
  const enrollment = await getTesdaEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;

  const [profile, address, guardian, docs, classifications] = await Promise.all([
    getProfileByStudentId(pool, enrollment.student_id),
    getAddressByStudentId(pool, enrollment.student_id),
    getGuardianByStudentId(pool, enrollment.student_id),
    getTesdaDocsByEnrollmentId(pool, enrollment.enrollment_id),
    getClassificationsByEnrollmentId(pool, enrollment.enrollment_id),
  ]);

  return {
    enrollment,
    profile,
    address,
    guardian,
    docs,
    classifications,
    // => logs: no enrollment_logs table exists yet - frontend renders an
    //    empty state when this is omitted/empty. See audit log TODO.
  };
};

// 
// SHS DETAIL: enrollment + shared profile/address + SHS-only docs and
//   family members (keyed by student_id, not enrollment_id)
// 
export const fetchShsEnrollmentDetail = async (publicId) => {
  const enrollment = await getShsEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;

  const [profile, address, docs, familyMembers, clusterCourses] = await Promise.all([
    getProfileByStudentId(pool, enrollment.student_id),
    getAddressByStudentId(pool, enrollment.student_id),
    getShsDocsByEnrollmentId(pool, enrollment.enrollment_id),
    getFamilyMembersByStudentId(pool, enrollment.student_id),
    // => Read-only G11/G12 curriculum for whatever cluster the student
    //    submitted with - cluster itself is locked from editing, so this
    //    always reflects their actual submission, never something reassigned
    getClusterCourses(pool, enrollment.cluster),
  ]);

  return {
    enrollment,
    profile,
    address,
    docs,
    familyMembers,
    clusterCourses,
    // => logs: same TODO as TESDA above
  };
};

// 
// STATUS UPDATES - both types share the same allowed status set
// 
const ALLOWED_STATUSES = [
  'Pending',
  'Approved',
  'Needs Clarification',
  'Rejected',
  'Dropped',
  'Completed',
  'Reserved',
];

export const changeTesdaEnrollmentStatus = async (publicId, newStatus, externalRemarks) => {
  if (!ALLOWED_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }
  return await updateTesdaEnrollmentStatus(pool, publicId, newStatus, externalRemarks);
};

export const changeShsEnrollmentStatus = async (publicId, newStatus, externalRemarks) => {
  if (!ALLOWED_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }
  return await updateShsEnrollmentStatus(pool, publicId, newStatus, externalRemarks);
};


// 
// SECTION UPDATES - resolve student_id from the enrollment first (since
//   profile/address/guardian aren't directly keyed by public_id), then
//   delegate to the shared/table-specific model functions
// 

export const updateTesdaProfileSection = async (publicId, fields) => {
  const enrollment = await getTesdaEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;
  return await updateProfile(pool, enrollment.student_id, fields);
};

export const updateTesdaAddressSection = async (publicId, fields) => {
  const enrollment = await getTesdaEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;
  return await updateAddress(pool, enrollment.student_id, fields);
};

export const updateTesdaGuardianSection = async (publicId, fields) => {
  const enrollment = await getTesdaEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;
  return await upsertGuardian(pool, enrollment.student_id, fields);
};

export const updateTesdaEnrollmentSection = async (publicId, fields) => {
  return await updateTesdaEnrollmentFields(pool, publicId, fields);
};

export const updateTesdaClassificationsSection = async (publicId, classifications, othersText) => {
  const enrollment = await getTesdaEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;
  await replaceClassifications(pool, enrollment.enrollment_id, classifications, othersText);
  return await getClassificationsByEnrollmentId(pool, enrollment.enrollment_id);
};

export const updateShsProfileSection = async (publicId, fields) => {
  const enrollment = await getShsEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;
  return await updateProfile(pool, enrollment.student_id, fields);
};

export const updateShsAddressSection = async (publicId, fields) => {
  const enrollment = await getShsEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;
  return await updateAddress(pool, enrollment.student_id, fields);
};

export const updateShsEnrollmentSection = async (publicId, fields) => {
  return await updateShsEnrollmentFields(pool, publicId, fields);
};

export const updateShsFamilySection = async (publicId, members) => {
  const enrollment = await getShsEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;
  await replaceFamilyMembers(pool, enrollment.student_id, members);
  return await getFamilyMembersByStudentId(pool, enrollment.student_id);
};

// 
// DOCUMENT ADD / REPLACE
// => R2 upload happens in the controller (needs req.file from multer);
//    these just persist the resulting key against the right enrollment
// 
export const addTesdaDocumentSection = async (publicId, docData) => {
  const enrollment = await getTesdaEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;
  return await addTesdaDocument(pool, enrollment.enrollment_id, docData);
};

export const replaceTesdaDocumentSection = async (docPublicId, documentKey) => {
  return await replaceTesdaDocument(pool, docPublicId, documentKey);
};

// Add SHS document by public_id
export const addShsDocumentSection = async (publicId, docData) => {
  const enrollment = await getShsEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;
  return await addShsDocument(pool, enrollment.enrollment_id, docData);
};

// Replace SHS document by public_id
export const replaceShsDocumentSection = async (docPublicId, documentKey) => {
  return await replaceShsDocument(pool, docPublicId, documentKey);
};

// Delete SHS document by public_id
export const deleteShsDocumentSection = async (docPublicId) => {
  return await deleteShsDocument(pool, docPublicId);
};

// Delete TESDA document by public_id
// => New - mirrors deleteShsDocumentSection, no service-layer logic needed,
//    the audit check itself lives in the model
export const deleteTesdaDocumentSection = async (docPublicId) => {
  return await deleteTesdaDocument(pool, docPublicId);
};
// SHS Classes 
export const fetchAvailableShsClasses = async (filters) => {
  return await getAvailableShsClasses(pool, filters);
};

// TESDA Classes
export const fetchAvailableTesdaClasses = async (filters) => {
  return await getAvailableTesdaClasses(pool, filters);
};

export const fetchShsTracksAndClusters = async () => {
  return await getShsTracksAndClusters(pool);
};