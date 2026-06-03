// => admin/models/adminEnrollmentModel.js
// => All queries receive `pool` as a param - mirrors the student-side pattern
// => Only admins call these; student ownership checks are NOT needed here

// 
// GET PENDING / NEEDS-CLARIFICATION ENROLLMENTS (LIST VIEW)
// => Returns only 'Pending' and 'Needs Clarification' enrollments
// => Joined with course, sector, branch, class, and student profile for display
// => Sorted by submitted_at ASC so oldest (most urgent) appears first
// 
export const getPendingEnrollments = async (pool) => {
  const result = await pool.query(
    `SELECT
        e.public_id,
        e.status,
        e.submitted_at,
        e.assessment_type,
        e.fee_at_enrollment,
        e.is_shs,
        e.is_tesda_scholar,
        c.title                                           AS course_name,
        s.sector                                          AS sector,
        COALESCE(b_direct.branch_name, b_class.branch_name) AS branch_name,
        cl.start_date,
        cl.end_date,
        -- => Student identity for admin context
        sp.first_name,
        sp.surname,
        sp.middle_name,
        sp.sex,
        sp.birthdate,
        sa.username                                          AS student_username
      FROM enrollment e
      JOIN student_accounts sa   ON e.student_id   = sa.student_id
      LEFT JOIN student_profile sp ON sp.student_id = sa.student_id
      LEFT JOIN courses c          ON e.course_id   = c.course_id
      LEFT JOIN sectors s          ON c.sector_id   = s.sector_id
      LEFT JOIN classes cl         ON e.class_id    = cl.class_id
      LEFT JOIN branches b_direct  ON e.branch_id   = b_direct.branch_id
      LEFT JOIN branches b_class   ON cl.branch_id  = b_class.branch_id
      WHERE e.status IN ('Pending', 'Needs Clarification')
      ORDER BY e.submitted_at ASC`
  );
  return result.rows;
};

// => Fetches only what lives directly on the enrollment row and its FK-joined tables
// => Profile columns (name, sex, birthdate, etc.) are NOT selected here
// => They are fetched separately in the service using profile_id
export const getEnrollmentDetailByPublicId = async (pool, publicId) => {
  const result = await pool.query(
    `SELECT
        e.public_id,
        e.enrollment_id,
        e.student_id,
        e.status,
        e.submitted_at,
        e.updated_at,
        e.assessment_type,
        e.fee_at_enrollment,
        e.is_shs,
        e.is_tesda_scholar,
        -- => Course info
        c.title                                              AS course_name,
        c.course_id,
        s.sector                                             AS sector,
        -- => Branch resolved same way as student side: direct branch_id first, class branch as fallback
        COALESCE(b_direct.branch_name, b_class.branch_name) AS branch_name,
        cl.start_date,
        cl.end_date,
        -- => Only username comes from student_accounts directly
        sa.username AS student_username
      FROM enrollment e
      JOIN  student_accounts sa    ON e.student_id  = sa.student_id
      LEFT JOIN courses c          ON e.course_id   = c.course_id
      LEFT JOIN sectors s          ON c.sector_id   = s.sector_id
      LEFT JOIN classes cl         ON e.class_id    = cl.class_id
      LEFT JOIN branches b_direct  ON e.branch_id   = b_direct.branch_id
      LEFT JOIN branches b_class   ON cl.branch_id  = b_class.branch_id
      WHERE e.public_id = $1`,
    [publicId]
  );
  return result.rows[0] ?? null;
};

// 
// GET ENROLLMENT DOCUMENTS BY ENROLLMENT ID
// => Returns all docs tied to an enrollment row
// => Uses internal enrollment_id (not public_id) - resolved from detail query above
// 
export const getEnrollmentDocsByEnrollmentId = async (pool, enrollmentId) => {
  const result = await pool.query(
    `SELECT
        public_id,
        document_type,
        document_key,
        uploaded_at
      FROM enrollment_documents
      WHERE enrollment_id = $1
      ORDER BY uploaded_at ASC`,
    [enrollmentId]
  );
  return result.rows;
};

// 
// GET WORK EXPERIENCE BY ENROLLMENT ID
// 
export const getWorkExperienceByEnrollmentId = async (pool, enrollmentId) => {
  const result = await pool.query(
    `SELECT
        company, position, salary,
        date_from, date_to, appointment_status, years_exp
      FROM work_experience
      WHERE enrollment_id = $1
      ORDER BY date_from DESC NULLS LAST`,
    [enrollmentId]
  );
  return result.rows;
};

// 
// GET TRAINING / SEMINARS BY ENROLLMENT ID
// 
export const getTrainingSeminarsByEnrollmentId = async (pool, enrollmentId) => {
  const result = await pool.query(
    `SELECT
        title, venue, date_from, date_to, hours, conducted_by
      FROM training_seminar
      WHERE enrollment_id = $1
      ORDER BY date_from DESC NULLS LAST`,
    [enrollmentId]
  );
  return result.rows;
};

// 
// GET LICENSURE EXAMINATIONS BY PROFILE ID
// => Licensures are tied to student_profile, not enrollment
// => profile_id is resolved via student_profile join in the detail query
// 
export const getLicensuresByProfileId = async (pool, profileId) => {
  const result = await pool.query(
    `SELECT
        title, year_taken, examination_venue, rating, remarks, expiry_date
      FROM licensure_examination
      WHERE profile_id = $1
      ORDER BY year_taken DESC NULLS LAST`,
    [profileId]
  );
  return result.rows;
};

// 
// GET COMPETENCY ASSESSMENTS BY PROFILE ID
// => Competencies are also tied to student_profile, not enrollment
// 
export const getCompetenciesByProfileId = async (pool, profileId) => {
  const result = await pool.query(
    `SELECT
        title, qualification_level, industry_sector,
        certificate_number, date_of_issuance, expiration_date
      FROM competency_assessment
      WHERE profile_id = $1
      ORDER BY date_of_issuance DESC NULLS LAST`,
    [profileId]
  );
  return result.rows;
};

// 
// UPDATE ENROLLMENT STATUS
// => Called by the admin after reviewing the enrollment
// => Returns the updated row so the frontend can reflect the change immediately
// 
export const updateEnrollmentStatus = async (pool, publicId, newStatus) => {
  const result = await pool.query(
    `UPDATE enrollment
        SET status     = $1,
            updated_at = NOW()
      WHERE public_id  = $2
      RETURNING public_id, status`,
    [newStatus, publicId]
  );
  return result.rows[0] ?? null;
};


// => Search enrollments across ALL statuses by email or profile name fields
// => Used by admin search - not restricted to Pending/Needs Clarification
export const searchEnrollments = async (pool, { email, first_name, middle_name, surname, name_extension }) => {
  const client = await pool.connect();
  try {
    const rows = await client.query(`
      SELECT
        e.public_id,
        e.status,
        e.submitted_at,
        e.assessment_type,
        sa.username         AS student_email,
        c.title           AS course_name,
        s.sector,
         COALESCE(b_direct.branch_name, b_class.branch_name) AS branch_name,
        sp.first_name,
        sp.middle_name,
        sp.surname,
        sp.name_extension
      FROM enrollment e
      JOIN  student_accounts sa    ON sa.student_id  = e.student_id
      LEFT JOIN courses c          ON c.course_id    = e.course_id
      LEFT JOIN sectors s          ON c.sector_id    = s.sector_id
      LEFT JOIN classes cl         ON e.class_id     = cl.class_id
      LEFT JOIN branches b_direct  ON e.branch_id    = b_direct.branch_id
      LEFT JOIN branches b_class   ON cl.branch_id   = b_class.branch_id
      LEFT JOIN student_profile sp ON sp.student_id  = e.student_id
      WHERE
        -- => At least one search param must match; all provided params are ANDed together
        ($1::text IS NULL OR sa.username          ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR sp.first_name      ILIKE '%' || $2 || '%')
        AND ($3::text IS NULL OR sp.middle_name     ILIKE '%' || $3 || '%')
        AND ($4::text IS NULL OR sp.surname         ILIKE '%' || $4 || '%')
        AND ($5::text IS NULL OR sp.name_extension  ILIKE '%' || $5 || '%')
      ORDER BY e.submitted_at DESC
      LIMIT 50
    `, [
      email         || null,
      first_name    || null,
      middle_name   || null,
      surname       || null,
      name_extension || null,
    ]);
    return rows.rows;
  } finally {
    client.release();
  }
};