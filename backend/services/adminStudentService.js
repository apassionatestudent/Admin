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
    // => Profile fields - matches latest student_profile schema, no alias
    last_name, first_name, middle_name, name_extension,
    birth_date,
    birthplace_region, birthplace_province, birthplace_city,
    nationality, sex, civil_status,
    highest_educ_attainment, employment_status,
    facebook_link, email, contact_no, religion, religion_others,
    // => Account fields
    username, is_email_confirmed,
  } = body;

  // => Validate required profile fields before hitting DB
  // => Mirrors the NOT NULL constraints on the latest student_profile table
  if (!last_name)          throw new Error('last_name is required.');
  if (!first_name)        throw new Error('first_name is required.');
  if (!birthplace_region) throw new Error('birthplace_region is required.');
  if (!nationality)       throw new Error('nationality is required.');
  if (!sex)                throw new Error('sex is required.');
  if (!facebook_link)     throw new Error('facebook_link is required.');
  if (!email)              throw new Error('email is required.');
  if (!contact_no)         throw new Error('contact_no is required.');

  // => Run profile upsert and account update in parallel
  const [updatedProfile, updatedAccount] = await Promise.all([
    updateStudentProfile(pool, studentRow.student_id, {
      last_name, first_name, middle_name, name_extension,
      birth_date,
      birthplace_region, birthplace_province, birthplace_city,
      nationality, sex, civil_status,
      highest_educ_attainment, employment_status,
      facebook_link, email, contact_no, religion, religion_others,
    }),
    // => Only pass account fields that were actually provided
    (username !== undefined || is_email_confirmed !== undefined)
      ? updateStudentAccount(pool, studentRow.student_id, { username, is_email_confirmed })
      : Promise.resolve(null),
  ]);

  return { updatedProfile, updatedAccount };
};
