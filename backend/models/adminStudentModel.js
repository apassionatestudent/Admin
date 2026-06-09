// => admin/models/adminStudentModel.js
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
        sa.is_email_confirmed,
        sa.created_at,
        sa.last_login_at,
        sp.surname,
        sp.first_name,
        sp.middle_name,
        sp.name_extension,
        COUNT(e.enrollment_id)::int AS enrollment_count
      FROM student_accounts sa
      LEFT JOIN student_profile sp ON sp.student_id = sa.student_id
      LEFT JOIN enrollment       e  ON e.student_id  = sa.student_id
      ${activeClause}
      GROUP BY
        sa.public_id, sa.student_id, sa.username,
        sa.is_active, sa.is_email_confirmed, sa.created_at, sa.last_login_at,
        sp.surname, sp.first_name, sp.middle_name, sp.name_extension
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
// => 1) Free-text (q param): ORs across surname, first_name, and username
// =>    Used by the main search bar; handles students with no profile (null surname)
// => 2) Field filters (More Options): ANDs individual fields together
export const searchStudents = async (pool, filters, page = 1) => {
  const limit  = 10;
  const offset = (page - 1) * limit;

  const { q, surname, first_name, middle_name, name_extension, username } = filters;

  // => Build WHERE clause depending on which mode was used
  let whereClause;
  let params;

  // => Combined mode: q (free-text OR) + individual fields (AND) can both be present
  // => q matches across surname, first_name, and username with OR
  // => Individual fields are ANDed on top as additional narrowing filters
  // => All params are positional so we build them in a fixed order
  params = [
    q              || null,   // => $1 free-text
    surname        || null,   // => $2
    first_name     || null,   // => $3
    middle_name    || null,   // => $4
    name_extension || null,   // => $5
    username       || null,   // => $6 (kept for More Options future use; currently unused by frontend)
  ];

  whereClause = `
    WHERE
      -- => q: free-text OR across name fields and email; skipped if null
      ($1::text IS NULL OR (
        sp.surname     ILIKE '%' || $1 || '%'
        OR sp.first_name  ILIKE '%' || $1 || '%'
        OR sa.username    ILIKE '%' || $1 || '%'
      ))
      -- => Individual field filters (AND); each skipped if null
      AND ($2::text IS NULL OR sp.surname        ILIKE '%' || $2 || '%')
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
        sa.is_email_confirmed,
        sa.created_at,
        sa.last_login_at,
        sp.surname,
        sp.first_name,
        sp.middle_name,
        sp.name_extension,
        COUNT(e.enrollment_id)::int AS enrollment_count
      FROM student_accounts sa
      LEFT JOIN student_profile sp ON sp.student_id = sa.student_id
      LEFT JOIN enrollment       e  ON e.student_id  = sa.student_id
      ${whereClause}
      GROUP BY
        sa.public_id, sa.student_id, sa.username,
        sa.is_active, sa.is_email_confirmed, sa.created_at, sa.last_login_at,
        sp.surname, sp.first_name, sp.middle_name, sp.name_extension
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
        sa.is_email_confirmed,
        sa.created_at,
        sa.updated_at,
        sa.last_login_at,
        -- => Profile fields
        sp.profile_id,
        sp.uli,
        sp.surname,
        sp.first_name,
        sp.middle_name,
        sp.name_extension,
        sp.mother_name,
        sp.father_name,
        sp.birthdate,
        sp.birthplace_region,
        sp.birthplace_province,
        sp.birthplace_city_or_municipality,
        sp.nationality,
        sp.sex,
        sp.civil_status,
        sp.highest_educational_attainment,
        sp.employment_status,
        sp.client_type
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
// => Joins class, course, branch for display
// 
export const getStudentEnrollmentHistory = async (pool, studentId) => {
  const result = await pool.query(
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
        -- => Branch info
        b.branch_name
      FROM enrollment e
      JOIN  classes   cl ON e.class_id   = cl.class_id
      LEFT JOIN courses   c  ON cl.course_id  = c.course_id
      LEFT JOIN branches  b  ON cl.branch_id  = b.branch_id
      WHERE e.student_id = $1
      ORDER BY e.submitted_at DESC NULLS LAST`,
    [studentId]
  );
  return result.rows;
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
// => account-level fields (username, is_email_confirmed) updated separately
// 
export const updateStudentProfile = async (pool, studentId, profileFields) => {
  const {
    uli,
    surname,
    first_name,
    middle_name,
    name_extension,
    mother_name,
    father_name,
    birthdate,
    birthplace_region,
    birthplace_province,
    birthplace_city_or_municipality,
    nationality,
    sex,
    civil_status,
    highest_educational_attainment,
    employment_status,
    client_type,
  } = profileFields;

  // => INSERT ... ON CONFLICT (student_id) DO UPDATE
  // => This handles both students who have a profile and those who don't yet
  const result = await pool.query(
    `INSERT INTO student_profile
        (student_id, uli, surname, first_name, middle_name, name_extension,
         mother_name, father_name, birthdate,
         birthplace_region, birthplace_province, birthplace_city_or_municipality,
         nationality, sex, civil_status, highest_educational_attainment,
         employment_status, client_type)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      ON CONFLICT (student_id) DO UPDATE SET
        uli                             = EXCLUDED.uli,
        surname                         = EXCLUDED.surname,
        first_name                      = EXCLUDED.first_name,
        middle_name                     = EXCLUDED.middle_name,
        name_extension                  = EXCLUDED.name_extension,
        mother_name                     = EXCLUDED.mother_name,
        father_name                     = EXCLUDED.father_name,
        birthdate                       = EXCLUDED.birthdate,
        birthplace_region               = EXCLUDED.birthplace_region,
        birthplace_province             = EXCLUDED.birthplace_province,
        birthplace_city_or_municipality = EXCLUDED.birthplace_city_or_municipality,
        nationality                     = EXCLUDED.nationality,
        sex                             = EXCLUDED.sex,
        civil_status                    = EXCLUDED.civil_status,
        highest_educational_attainment  = EXCLUDED.highest_educational_attainment,
        employment_status               = EXCLUDED.employment_status,
        client_type                     = EXCLUDED.client_type
      RETURNING *`,
    [
      studentId, uli || null, surname, first_name,
      middle_name || null, name_extension || null,
      mother_name, father_name, birthdate,
      birthplace_region, birthplace_province || null,
      birthplace_city_or_municipality,
      nationality, sex, civil_status,
      highest_educational_attainment, employment_status,
      client_type || null,
    ]
  );
  return result.rows[0] ?? null;
};

// 
// UPDATE STUDENT ACCOUNT FIELDS
// => Updates username and/or is_email_confirmed on student_accounts
// 
export const updateStudentAccount = async (pool, studentId, accountFields) => {
  const { username, is_email_confirmed } = accountFields;

  const result = await pool.query(
    `UPDATE student_accounts
        SET username           = COALESCE($1, username),
            is_email_confirmed = COALESCE($2, is_email_confirmed),
            updated_at         = NOW()
      WHERE student_id = $3
      RETURNING public_id, student_id, username, is_email_confirmed, is_active, updated_at`,
    [
      username           ?? null,
      is_email_confirmed ?? null,
      studentId,
    ]
  );
  return result.rows[0] ?? null;
};
