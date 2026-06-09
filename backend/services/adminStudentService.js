// => admin/services/adminStudentService.js
// => Mirrors adminClassService.js pattern
// => pool is imported here so controllers stay thin

import { pool } from '../config/db.js';

import {
  getPaginatedStudents,
  searchStudents,
  getStudentByPublicId,
  getStudentEnrollmentHistory,
  toggleStudentActive,
  updateStudentProfile,
  updateStudentAccount,
} from '../models/adminStudentModel.js';

// => onlyActive defaults true so the list view hides inactive students
// => Search calls this with onlyActive=false so inactive students surface
export const fetchStudents = async (page = 1, onlyActive = true) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  return await getPaginatedStudents(pool, pageNum, onlyActive);
};

// SEARCH STUDENTS (paginated)
export const searchStudentsService = async (filters, page = 1) => {
  // => Require at least one non-empty filter
  const hasFilter = Object.values(filters).some(v => v && String(v).trim());
  if (!hasFilter) throw new Error('At least one search field is required.');

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  return await searchStudents(pool, filters, pageNum);
};

// FETCH STUDENT DETAIL
// => Returns account + profile bundle; null if not found
export const fetchStudentDetail = async (publicId) => {
  const studentRow = await getStudentByPublicId(pool, publicId);
  if (!studentRow) return null;

  // => Fetch enrollment history in parallel with any future sub-queries
  const [enrollments] = await Promise.all([
    getStudentEnrollmentHistory(pool, studentRow.student_id),
  ]);

  return { studentRow, enrollments };
};

// TOGGLE STUDENT ACTIVE STATUS
export const toggleActiveStatus = async (publicId, isActive) => {
  if (typeof isActive !== 'boolean') {
    throw new Error('is_active must be a boolean.');
  }
  const updated = await toggleStudentActive(pool, publicId, isActive);
  if (!updated) throw new Error('Student not found.');
  return updated;
};

// UPDATE STUDENT RECORD (profile + account fields)
// => Runs profile upsert and account update in parallel
// => Both are independent so Promise.all is safe here
export const updateStudentRecord = async (publicId, body) => {
  // => First resolve the student_id from the public_id
  const studentRow = await getStudentByPublicId(pool, publicId);
  if (!studentRow) throw new Error('Student not found.');

  const {
    // => Profile fields
    uli, surname, first_name, middle_name, name_extension,
    mother_name, father_name, birthdate,
    birthplace_region, birthplace_province, birthplace_city_or_municipality,
    nationality, sex, civil_status,
    highest_educational_attainment, employment_status, client_type,
    // => Account fields
    username, is_email_confirmed,
  } = body;

  // => Validate required profile fields before hitting DB
  if (!surname)                          throw new Error('surname is required.');
  if (!first_name)                       throw new Error('first_name is required.');
  if (!mother_name)                      throw new Error('mother_name is required.');
  if (!father_name)                      throw new Error('father_name is required.');
  if (!birthdate)                        throw new Error('birthdate is required.');
  if (!birthplace_region)                throw new Error('birthplace_region is required.');
  if (!birthplace_city_or_municipality)  throw new Error('birthplace_city_or_municipality is required.');
  if (!nationality)                      throw new Error('nationality is required.');
  if (!sex)                              throw new Error('sex is required.');
  if (!civil_status)                     throw new Error('civil_status is required.');
  if (!highest_educational_attainment)   throw new Error('highest_educational_attainment is required.');
  if (!employment_status)                throw new Error('employment_status is required.');

  // => Run profile upsert and account update in parallel
  const [updatedProfile, updatedAccount] = await Promise.all([
    updateStudentProfile(pool, studentRow.student_id, {
      uli, surname, first_name, middle_name, name_extension,
      mother_name, father_name, birthdate,
      birthplace_region, birthplace_province, birthplace_city_or_municipality,
      nationality, sex, civil_status,
      highest_educational_attainment, employment_status, client_type,
    }),
    // => Only pass account fields that were actually provided
    (username !== undefined || is_email_confirmed !== undefined)
      ? updateStudentAccount(pool, studentRow.student_id, { username, is_email_confirmed })
      : Promise.resolve(null),
  ]);

  return { updatedProfile, updatedAccount };
};
