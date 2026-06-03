// => admin/services/adminEnrollmentService.js
// => Mirrors the pattern in enrollmentService.js and documentService.js
// => pool is imported here so controllers stay thin

import { pool } from '../config/db.js';

import {
  getPendingEnrollments,
  getEnrollmentDetailByPublicId,
  getEnrollmentDocsByEnrollmentId,
  getWorkExperienceByEnrollmentId,
  getTrainingSeminarsByEnrollmentId,
  updateEnrollmentStatus,
  searchEnrollments
} from '../models/adminEnrollmentModel.js';

// 
// GET LIST: pending + needs-clarification enrollments
// 
export const fetchPendingEnrollments = async () => {
  return await getPendingEnrollments(pool);
};

// 
// GET DETAIL: full enrollment data + related tables in one response object
// => Assembles enrollment info, student profile, docs, work exp, trainings
// => profile_id is not directly on the enrollment row so we derive it via
//    a second query after the main detail fetch
// 
export const fetchEnrollmentDetail = async (publicId) => {
  const enrollment = await getEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;

  // => Resolve profile_id from student_profile using student_id from the enrollment row
  const profileResult = await pool.query(
    `SELECT * FROM student_profile WHERE student_id = $1 LIMIT 1`,
    [enrollment.student_id]
  );
  const profile   = profileResult.rows[0] ?? null;
  const profileId = profile?.profile_id ?? null;

  // => Fetch all related sub-tables in parallel
  const [docs, workExp, trainings, licensures, competencies, contacts, address] =
    await Promise.all([
      getEnrollmentDocsByEnrollmentId(pool, enrollment.enrollment_id),
      getWorkExperienceByEnrollmentId(pool, enrollment.enrollment_id),
      getTrainingSeminarsByEnrollmentId(pool, enrollment.enrollment_id),

      profileId
        ? pool.query(
            `SELECT title, year_taken, examination_venue, rating, remarks, expiry_date
               FROM licensure_examination WHERE profile_id = $1 ORDER BY year_taken DESC NULLS LAST`,
            [profileId]
          ).then(r => r.rows)
        : Promise.resolve([]),

      profileId
        ? pool.query(
            `SELECT title, qualification_level, industry_sector,
                    certificate_number, date_of_issuance, expiration_date
               FROM competency_assessment WHERE profile_id = $1 ORDER BY date_of_issuance DESC NULLS LAST`,
            [profileId]
          ).then(r => r.rows)
        : Promise.resolve([]),

      profileId
        ? pool.query(
            `SELECT contact_type, contact_value
               FROM contact_numbers WHERE profile_id = $1`,
            [profileId]
          ).then(r => r.rows)
        : Promise.resolve([]),

      profileId
        ? pool.query(
            `SELECT street, barangay_code, city_code, province_code, region_code, zip_code
               FROM student_address WHERE profile_id = $1 LIMIT 1`,
            [profileId]
          ).then(r => r.rows[0] ?? null)
        : Promise.resolve(null),
    ]);

  return {
    enrollment,  // => lean: only enrollment + course + branch + email
    profile,     // => separate: all student_profile columns
    docs,
    workExp,
    trainings,
    licensures,
    competencies,
    contacts,
    address,
  };
};

// 
// UPDATE STATUS
// => Validates allowed statuses server-side before hitting the DB
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

export const changeEnrollmentStatus = async (publicId, newStatus) => {
  if (!ALLOWED_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }
  return await updateEnrollmentStatus(pool, publicId, newStatus);
};


// => Search enrollments across all statuses - delegates directly to model
export const searchEnrollmentsService = async (filters) => {  // ✅ Remove pool parameter
  const hasFilter = Object.values(filters).some(v => v && v.trim());
  if (!hasFilter) throw new Error('At least one search field is required.');
  return searchEnrollments(pool, filters);  // ✅ pool is already imported at top of file
};