// => admin/services/Enrollments/tesdaEnrollmentService.js
// => Split out of the old adminEnrollmentService.js - TESDA-only logic.
//    Shared profile/address/guardian model functions and ALLOWED_STATUSES
//    are imported from the shared files below.

import { pool } from '../../config/db.js';

import {
  getProfileByStudentId,
  getAddressByStudentId,
  getGuardianByStudentId,
  updateProfile,
  updateAddress,
  upsertGuardian,
} from '../../models/Enrollments/sharedEnrollmentModel.js';

import {
  getTesdaEnrollmentDetailByPublicId,
  getTesdaDocsByEnrollmentId,
  getClassificationsByEnrollmentId,
  updateTesdaEnrollmentStatus,
  updateTesdaEnrollmentFields,
  replaceClassifications,
  addTesdaDocument,
  replaceTesdaDocument,
  deleteTesdaDocument,
  getAvailableTesdaClasses,
} from '../../models/Enrollments/tesdaEnrollmentModel.js';

import { ALLOWED_STATUSES } from './sharedEnrollmentService.js';

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
// STATUS UPDATE
//
export const changeTesdaEnrollmentStatus = async (publicId, newStatus, externalRemarks) => {
  if (!ALLOWED_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }
  return await updateTesdaEnrollmentStatus(pool, publicId, newStatus, externalRemarks);
};

//
// SECTION UPDATES - resolve student_id from the enrollment first (since
//   profile/address/guardian aren't directly keyed by public_id), then
//   delegate to the shared model functions
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

//
// DOCUMENT ADD / REPLACE / DELETE
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

export const deleteTesdaDocumentSection = async (docPublicId) => {
  return await deleteTesdaDocument(pool, docPublicId);
};

//
// TESDA CLASSES
//
export const fetchAvailableTesdaClasses = async (filters) => {
  return await getAvailableTesdaClasses(pool, filters);
};
