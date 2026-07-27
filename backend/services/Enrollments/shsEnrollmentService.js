// => admin/services/Enrollments/shsEnrollmentService.js
// => Split out of the old adminEnrollmentService.js - SHS-only logic.
//    Shared profile/address model functions and ALLOWED_STATUSES are
//    imported from the shared files below.

import { pool } from '../../config/db.js';

import {
  getProfileByStudentId,
  getAddressByStudentId,
  updateProfile,
  updateAddress,
} from '../../models/Enrollments/sharedEnrollmentModel.js';

import {
  getShsEnrollmentDetailByPublicId,
  getShsDocsByEnrollmentId,
  getFamilyMembersByStudentId,
  getClusterCourses,
  updateShsEnrollmentStatus,
  updateShsEnrollmentFields,
  replaceFamilyMembers,
  addShsDocument,
  replaceShsDocument,
  deleteShsDocument,
  getAvailableShsClasses,
  getShsTracksAndClusters,
} from '../../models/Enrollments/shsEnrollmentModel.js';

import { ALLOWED_STATUSES } from './sharedEnrollmentService.js';

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
    getClusterCourses(pool, enrollment.cluster_id),
  ]);

  return {
    enrollment,
    profile,
    address,
    docs,
    familyMembers,
    clusterCourses,
    // => logs: same TODO as TESDA - no enrollment_logs table exists yet
  };
};

//
// STATUS UPDATE
//
export const changeShsEnrollmentStatus = async (publicId, newStatus, externalRemarks) => {
  if (!ALLOWED_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }
  return await updateShsEnrollmentStatus(pool, publicId, newStatus, externalRemarks);
};

//
// SECTION UPDATES - resolve student_id from the enrollment first (since
//   profile/address aren't directly keyed by public_id), then delegate to
//   the shared model functions
//

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
// DOCUMENT ADD / REPLACE / DELETE
// => R2 upload happens in the controller (needs req.file from multer);
//    these just persist the resulting key against the right enrollment
//
export const addShsDocumentSection = async (publicId, docData) => {
  const enrollment = await getShsEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;
  return await addShsDocument(pool, enrollment.enrollment_id, docData);
};

export const replaceShsDocumentSection = async (docPublicId, documentKey) => {
  return await replaceShsDocument(pool, docPublicId, documentKey);
};

export const deleteShsDocumentSection = async (docPublicId) => {
  return await deleteShsDocument(pool, docPublicId);
};

//
// SHS CLASSES + LOOKUPS
//
export const fetchAvailableShsClasses = async (filters) => {
  return await getAvailableShsClasses(pool, filters);
};

export const fetchShsTracksAndClusters = async () => {
  return await getShsTracksAndClusters(pool);
};
