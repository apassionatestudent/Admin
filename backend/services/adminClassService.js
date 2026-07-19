// => admin/services/adminClassService.js
// => Mirrors adminEnrollmentService.js pattern
// => pool is imported here so controllers stay thin

import { pool } from '../config/db.js';

import {
  getActiveClasses,
  getClassByPublicId,
  getEnrolledStudentsByClassId,
  updateClassStatus,
  createClass,
  searchClasses,
  getClassFormOptions,
} from '../models/adminClassModel.js';

// GET ACTIVE CLASSES (Ongoing + Planned)
export const fetchActiveClasses = async () => {
  return await getActiveClasses(pool);
};

// GET CLASS DETAIL
// => Returns class info + enrolled student list bundled together
export const fetchClassDetail = async (publicId) => {
  const classRow = await getClassByPublicId(pool, publicId);
  if (!classRow) return null;

  // => Fetch enrolled students in parallel with any future sub-queries
  const [enrolledStudents] = await Promise.all([
    getEnrolledStudentsByClassId(pool, classRow.class_id),
  ]);

  return {
    classRow,
    enrolledStudents,
  };
};

// UPDATE CLASS STATUS
// => TESDA-only for now - see updateClassStatus in adminClassModel.js
const ALLOWED_CLASS_STATUSES = ['Pending', 'Ongoing', 'Concluded'];

export const changeClassStatus = async (publicId, newStatus) => {
  if (!ALLOWED_CLASS_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }
  return await updateClassStatus(pool, publicId, newStatus);
};

// CREATE CLASS
export const addClass = async (classData) => {
  // => Basic required field validation before hitting the DB
  const { course_id, start_date, end_date, required_number_of_students, max_students } = classData;
  if (!course_id)                    throw new Error('course_id is required.');
  if (!start_date)                   throw new Error('start_date is required.');
  if (!end_date)                     throw new Error('end_date is required.');
  if (!required_number_of_students)  throw new Error('required_number_of_students is required.');
  if (!max_students)                 throw new Error('max_students is required.');

  if (new Date(start_date) > new Date(end_date)) {
    throw new Error('start_date cannot be after end_date.');
  }

  if (Number(required_number_of_students) > Number(max_students)) {
    throw new Error('required_number_of_students cannot exceed max_students.');
  }

  return await createClass(pool, classData);
};

// SEARCH CLASSES
export const searchClassesService = async (filters) => {
  const hasFilter = Object.values(filters).some(v => v && String(v).trim());
  if (!hasFilter) throw new Error('At least one search field is required.');
  return searchClasses(pool, filters);
};

// GET FORM OPTIONS (for Add Class modal dropdowns)
export const fetchClassFormOptions = async () => {
  return await getClassFormOptions(pool);
};
