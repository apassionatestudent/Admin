// => admin/models/Students/adminStudentModel.js
// => All queries receive `pool` as a param - mirrors adminClassModel.js pattern
// => Only admins call these

// 
// GET PAGINATED STUDENTS (LIST VIEW)
// => Returns latest students first (created_at DESC)
// => 10 per page; caller passes page number (1-based)
// => LEFT JOINs profile so students without a profile still appear
// => enrollment_count = total enrollments regardless of status
// 
export const getPaginatedStudents = async (pool, page = 1, onlyActive = false) => {
  const limit  = 10;
  const offset = (page - 1) * limit;

  // => onlyActive=true is used by the default list view (hides inactive students)
  // => onlyActive=false is used by search so inactive students surface when searched
  const activeClause = onlyActive ? `WHERE sa.is_active = true` : '';

  const rowsResult = await pool.query(
    `SELECT
        sa.public_id,
        sa.student_id,
        sa.username,
        sa.is_active,
        
        sa.created_at,
        sa.last_login_at,
        sp.last_name,
        sp.first_name,
        sp.middle_name,
        sp.name_extension,
        -- => enrollment_count now sums both TESDA and SHS enrollments.
        --    Correlated subqueries instead of a JOIN + GROUP BY, since
        --    joining two enrollments tables directly would create a
        --    cross-product and inflate the count for students who have
        --    rows in both
        (
          (SELECT COUNT(*) FROM tesda_enrollments te WHERE te.student_id = sa.student_id) +
          (SELECT COUNT(*) FROM shs_enrollments se WHERE se.student_id = sa.student_id)
        )::int AS enrollment_count
      FROM student_accounts sa
      LEFT JOIN student_profile sp ON sp.student_id = sa.student_id
      ${activeClause}
      ORDER BY sa.created_at DESC
      LIMIT  $1
      OFFSET $2`,
    [limit, offset]
  );

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
      FROM student_accounts sa
      ${activeClause}`
  );

  return {
    rows:  rowsResult.rows,
    total: countResult.rows[0].total,
    page,
    limit,
    totalPages: Math.ceil(countResult.rows[0].total / limit),
  };
};

// SEARCH STUDENTS
// => Two modes:
// => 1) Free-text (q param): ORs across last_name, first_name, and username
// =>    Used by the main search bar; handles students with no profile (null last_name)
// => 2) Field filters (More Options): ANDs individual fields together
export const searchStudents = async (pool, filters, page = 1) => {
  const limit  = 10;
  const offset = (page - 1) * limit;

  const { q, last_name, first_name, middle_name, name_extension, username } = filters;

  // => Build WHERE clause depending on which mode was used
  let whereClause;
  let params;

  // => Combined mode: q (free-text OR) + individual fields (AND) can both be present
  // => q matches across last_name, first_name, and username with OR
  // => Individual fields are ANDed on top as additional narrowing filters
  // => All params are positional so we build them in a fixed order
  params = [
    q              || null,   // => $1 free-text
    last_name        || null,   // => $2
    first_name     || null,   // => $3
    middle_name    || null,   // => $4
    name_extension || null,   // => $5
    username       || null,   // => $6 (kept for More Options future use; currently unused by frontend)
  ];

  whereClause = `
    WHERE
      -- => q: free-text OR across name fields and email; skipped if null
      ($1::text IS NULL OR (
        sp.last_name     ILIKE '%' || $1 || '%'
        OR sp.first_name  ILIKE '%' || $1 || '%'
        OR sa.username    ILIKE '%' || $1 || '%'
      ))
      -- => Individual field filters (AND); each skipped if null
      AND ($2::text IS NULL OR sp.last_name        ILIKE '%' || $2 || '%')
      AND ($3::text IS NULL OR sp.first_name     ILIKE '%' || $3 || '%')
      AND ($4::text IS NULL OR sp.middle_name    ILIKE '%' || $4 || '%')
      AND ($5::text IS NULL OR sp.name_extension ILIKE '%' || $5 || '%')
      AND ($6::text IS NULL OR sa.username       ILIKE '%' || $6 || '%')
  `;

  const limitParam  = params.length + 1; // => $7
  const offsetParam = params.length + 2; // => $8

  const rowsResult = await pool.query(
    `SELECT
        sa.public_id,
        sa.student_id,
        sa.username,
        sa.is_active,
        
        sa.created_at,
        sa.last_login_at,
        sp.last_name,
        sp.first_name,
        sp.middle_name,
        sp.name_extension,
        -- => enrollment_count now sums both TESDA and SHS enrollments,
        --    same reasoning as getPaginatedStudents above
        (
          (SELECT COUNT(*) FROM tesda_enrollments te WHERE te.student_id = sa.student_id) +
          (SELECT COUNT(*) FROM shs_enrollments se WHERE se.student_id = sa.student_id)
        )::int AS enrollment_count
      FROM student_accounts sa
      LEFT JOIN student_profile sp ON sp.student_id = sa.student_id
      ${whereClause}
      ORDER BY sa.created_at DESC
      LIMIT  $${limitParam}
      OFFSET $${offsetParam}`,
    [...params, limit, offset]
  );

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
      FROM student_accounts sa
      LEFT JOIN student_profile sp ON sp.student_id = sa.student_id
      ${whereClause}`,
    params
  );

  return {
    rows:  rowsResult.rows,
    total: countResult.rows[0].total,
    page,
    limit,
    totalPages: Math.ceil(countResult.rows[0].total / limit),
  };
};

// 
// GET STUDENT DETAIL BY PUBLIC ID
// => Returns account + full profile row joined together
// 
export const getStudentByPublicId = async (pool, publicId) => {
  const result = await pool.query(
    `SELECT
        -- => Account fields
        sa.public_id,
        sa.student_id,
        sa.username,
        sa.is_active,
        
        sa.created_at,
        sa.updated_at,
        sa.last_login_at,
        -- => Profile fields
        sp.profile_id,
        sp.last_name,
        sp.first_name,
        sp.middle_name,
        sp.name_extension,
        sp.birth_date,
        sp.birthplace_region,
        sp.birthplace_province,
        sp.birthplace_city,
        sp.nationality,
        sp.sex,
        sp.civil_status,
        sp.highest_educ_attainment,
        sp.employment_status,
        sp.facebook_link,
        sp.email,
        sp.contact_no,
        sp.religion,
        sp.religion_others
      FROM student_accounts sa
      LEFT JOIN student_profile sp ON sp.student_id = sa.student_id
      WHERE sa.public_id = $1`,
    [publicId]
  );
  return result.rows[0] ?? null;
};

// 
// GET ENROLLMENT HISTORY FOR A STUDENT
// => Returns all enrollments for the student ordered by most recent first
// => Joins class, course for display
// 
export const getStudentEnrollmentHistory = async (pool, studentId) => {
  // => TESDA enrollments for this student
  // => program_type tag added so the frontend can route each row to
  //    the correct detail page (enrollments/tesda/:publicId vs shs/:publicId)
  const tesdaResult = await pool.query(
    `SELECT
        e.public_id           AS enrollment_public_id,
        e.status              AS enrollment_status,
        e.submitted_at,
        -- => Class info
        cl.public_id          AS class_public_id,
        cl.status             AS class_status,
        cl.start_date,
        cl.end_date,
        -- => Course info
        c.title               AS course_name,
        'TESDA'                AS program_type
      FROM tesda_enrollments e
      JOIN  tesda_batches cl ON e.batch_id   = cl.batch_id
      LEFT JOIN tesda_courses c  ON cl.course_id  = c.course_id
      WHERE e.student_id = $1`,
    [studentId]
  );

  // => SHS enrollments for this student
  // => shs_batches DOES have a status column (Pending/Ongoing/Concluded/
  //    Dissolved), confirmed against schema, so class_status is included
  //    here same as TESDA
  // => sc.name stands in for course_name - a cluster is a fixed 2-year
  //    curriculum, not a single picked course, same reasoning as
  //    getShsEnrollmentDetailByPublicId in shsEnrollmentModel.js
  // => LEFT JOIN on shs_batches (not JOIN) because approveShsEnrollmentWithLock
  //    sets batch_id back to NULL when an enrollment gets swept to
  //    Reserved, an inner join would silently drop those rows here
  const shsResult = await pool.query(
    `SELECT
        e.public_id           AS enrollment_public_id,
        e.status              AS enrollment_status,
        e.submitted_at,
        -- => Class info
        cl.public_id          AS class_public_id,
        cl.status             AS class_status,
        cl.start_date,
        cl.end_date,
        -- => Cluster info (stands in for course info on the SHS side)
        sc.name                AS course_name,
        'SHS'                   AS program_type
      FROM shs_enrollments e
      LEFT JOIN shs_batches cl  ON e.batch_id   = cl.batch_id
      LEFT JOIN shs_clusters sc ON e.cluster_id = sc.cluster_id
      WHERE e.student_id = $1`,
    [studentId]
  );

  // => Merge both programs into a single timeline, latest submission first
  return [...tesdaResult.rows, ...shsResult.rows].sort(
    (a, b) => new Date(b.submitted_at) - new Date(a.submitted_at)
  );
};

// 
// TOGGLE STUDENT is_active
// => Flips is_active and bumps updated_at
// 
export const toggleStudentActive = async (pool, publicId, isActive) => {
  const result = await pool.query(
    `UPDATE student_accounts
        SET is_active  = $1,
            updated_at = NOW()
      WHERE public_id  = $2
      RETURNING public_id, student_id, is_active`,
    [isActive, publicId]
  );
  return result.rows[0] ?? null;
};

// 
// UPDATE STUDENT PROFILE
// => Upserts profile fields; if no profile row exists yet, inserts one
// => account-level fields (username, ) updated separately
// 
export const updateStudentProfile = async (pool, studentId, profileFields) => {
  const {
    last_name,
    first_name,
    middle_name,
    name_extension,
    birth_date,
    birthplace_region,
    birthplace_province,
    birthplace_city,
    nationality,
    sex,
    civil_status,
    highest_educ_attainment,
    employment_status,
    facebook_link,
    email,
    contact_no,
    religion,
    religion_others,
  } = profileFields;
  // => updated to match latest student_profile schema

  // => INSERT ... ON CONFLICT (student_id) DO UPDATE
  // => This handles both students who have a profile and those who don't yet
  const result = await pool.query(
    `INSERT INTO student_profile
        (student_id, last_name, first_name, middle_name, name_extension,
         birth_date, birthplace_region, birthplace_province, birthplace_city,
         nationality, sex, civil_status, highest_educ_attainment,
         employment_status, facebook_link, email, contact_no, religion, religion_others)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      ON CONFLICT (student_id) DO UPDATE SET
        last_name               = EXCLUDED.last_name,
        first_name              = EXCLUDED.first_name,
        middle_name             = EXCLUDED.middle_name,
        name_extension          = EXCLUDED.name_extension,
        birth_date               = EXCLUDED.birth_date,
        birthplace_region        = EXCLUDED.birthplace_region,
        birthplace_province      = EXCLUDED.birthplace_province,
        birthplace_city          = EXCLUDED.birthplace_city,
        nationality              = EXCLUDED.nationality,
        sex                      = EXCLUDED.sex,
        civil_status             = EXCLUDED.civil_status,
        highest_educ_attainment  = EXCLUDED.highest_educ_attainment,
        employment_status        = EXCLUDED.employment_status,
        facebook_link            = EXCLUDED.facebook_link,
        email                    = EXCLUDED.email,
        contact_no               = EXCLUDED.contact_no,
        religion                 = EXCLUDED.religion,
        religion_others          = EXCLUDED.religion_others
      RETURNING *`,
    [
      studentId, last_name, first_name,
      middle_name || null, name_extension || null,
      birth_date || null,
      birthplace_region, birthplace_province || null, birthplace_city || null,
      nationality, sex, civil_status || null,
      highest_educ_attainment || null, employment_status || null,
      facebook_link, email, contact_no || null,
      religion || null, religion_others || null,
    ]
  );
  return result.rows[0] ?? null;
};

// 
// UPDATE STUDENT ACCOUNT FIELDS
// => Updates username and/or  on student_accounts
// 
export const updateStudentAccount = async (pool, studentId, accountFields) => {
  const { username } = accountFields;
  // => username-only update, admin does not touch password_hash
  // => password changes are student-initiated via the reset flow, not this function

  const result = await pool.query(
    `UPDATE student_accounts
        SET username           = COALESCE($1, username),
            updated_at         = NOW()
      WHERE student_id = $2
      RETURNING public_id, student_id, username, is_active, updated_at`,
    [
      username ?? null,
      studentId,
    ]
  );
  return result.rows[0] ?? null;
};
