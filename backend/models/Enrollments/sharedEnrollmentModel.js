// => admin/models/Enrollments/sharedEnrollmentModel.js
// => Split out of the old adminEnrollmentModel.js - this file holds only
//    what is genuinely shared between TESDA and SHS: the combined list and
//    search queries (both are UNION ALL across the two tables, so they
//    can't be split by type), and the student_profile / student_address /
//    student_guardian lookups (these tables are shared identity data used
//    by both enrollment types).
// => All queries receive `pool` as a param - mirrors adminClassModel.js pattern
// => Only admins call these; student ownership checks are NOT needed here

//
// LIST: Pending + Needs Clarification enrollments, combined TESDA + SHS
// => UNION ALL with each side NULL-casting the other type's fields so
//    column types line up (course_name is TESDA-only, track/cluster SHS-only)
// => enrollment_type discriminator lets the frontend route to the right
//    detail page and render the right badge
//
export const getPendingEnrollments = async (pool) => {
  const result = await pool.query(
    `SELECT
        e.public_id,
        'TESDA'::text                                        AS enrollment_type,
        e.status,
        e.submitted_at,
        sa.username                                          AS student_email,
        sp.first_name,
        sp.middle_name,
        sp.last_name,
        sp.name_extension,
        c.title                                               AS course_name,
        NULL::text                                            AS cluster
      FROM tesda_enrollments e
      JOIN  student_accounts sa    ON sa.student_id  = e.student_id
      LEFT JOIN student_profile sp ON sp.student_id  = e.student_id
      LEFT JOIN tesda_courses c          ON c.course_id    = e.course_id
      LEFT JOIN tesda_batches cl   ON cl.batch_id    = e.batch_id
      WHERE e.status IN ('Pending', 'Needs Clarification')

      UNION ALL

      SELECT
        e.public_id,
        'SHS'::text                                          AS enrollment_type,
        e.status,
        e.submitted_at,
        sa.username                                          AS student_email,
        sp.first_name,
        sp.middle_name,
        sp.last_name,
        sp.name_extension,
        NULL::text                                            AS course_name,
        sc.name                                               AS cluster
      FROM shs_enrollments e
      JOIN  student_accounts sa    ON sa.student_id  = e.student_id
      LEFT JOIN student_profile sp ON sp.student_id  = e.student_id
      LEFT JOIN shs_batches cl     ON cl.batch_id    = e.batch_id
      LEFT JOIN shs_clusters sc    ON sc.cluster_id  = e.cluster_id
      WHERE e.status IN ('Pending', 'Needs Clarification')

      ORDER BY submitted_at ASC`
  );
  return result.rows;
};

//
// SEARCH: across ALL statuses, both TESDA and SHS, by email or profile name
// => Same UNION ALL shape as the list query above
// => Filter key is last_name, matching what the controller actually sends
// => Fixed: this used to destructure "surname" here while the controller
//    sent "last_name" in the filters object, so the surname filter was
//    silently a no-op. Renamed to match what's actually passed in.
//
export const searchEnrollments = async (pool, { email, first_name, middle_name, last_name, name_extension }) => {
  const client = await pool.connect();
  try {
    const rows = await client.query(
      `SELECT
          e.public_id,
          'TESDA'::text                                        AS enrollment_type,
          e.status,
          e.submitted_at,
          sa.username                                          AS student_email,
          sp.first_name,
          sp.middle_name,
          sp.last_name,
          sp.name_extension,
          c.title                                               AS course_name,
          NULL::text                                            AS cluster
        FROM tesda_enrollments e
        JOIN  student_accounts sa    ON sa.student_id  = e.student_id
        LEFT JOIN student_profile sp ON sp.student_id  = e.student_id
        LEFT JOIN tesda_courses c          ON c.course_id    = e.course_id
        LEFT JOIN tesda_batches cl   ON cl.batch_id    = e.batch_id
        WHERE
          ($1::text IS NULL OR sa.username      ILIKE '%' || $1 || '%')
          AND ($2::text IS NULL OR sp.first_name    ILIKE '%' || $2 || '%')
          AND ($3::text IS NULL OR sp.middle_name   ILIKE '%' || $3 || '%')
          AND ($4::text IS NULL OR sp.last_name     ILIKE '%' || $4 || '%')
          AND ($5::text IS NULL OR sp.name_extension ILIKE '%' || $5 || '%')

        UNION ALL

        SELECT
          e.public_id,
          'SHS'::text                                          AS enrollment_type,
          e.status,
          e.submitted_at,
          sa.username                                          AS student_email,
          sp.first_name,
          sp.middle_name,
          sp.last_name,
          sp.name_extension,
          NULL::text                                            AS course_name,
          sc.name                                               AS cluster
        FROM shs_enrollments e
        JOIN  student_accounts sa    ON sa.student_id  = e.student_id
        LEFT JOIN student_profile sp ON sp.student_id  = e.student_id
        LEFT JOIN shs_batches cl     ON cl.batch_id    = e.batch_id
        LEFT JOIN shs_clusters sc    ON sc.cluster_id  = e.cluster_id
        WHERE
          ($1::text IS NULL OR sa.username      ILIKE '%' || $1 || '%')
          AND ($2::text IS NULL OR sp.first_name    ILIKE '%' || $2 || '%')
          AND ($3::text IS NULL OR sp.middle_name   ILIKE '%' || $3 || '%')
          AND ($4::text IS NULL OR sp.last_name     ILIKE '%' || $4 || '%')
          AND ($5::text IS NULL OR sp.name_extension ILIKE '%' || $5 || '%')

        ORDER BY submitted_at DESC
        LIMIT 50`,
      [
        email          || null,
        first_name     || null,
        middle_name    || null,
        last_name      || null,
        name_extension || null,
      ]
    );
    return rows.rows;
  } finally {
    client.release();
  }
};

//
// SHARED PROFILE / ADDRESS / GUARDIAN LOOKUPS
// => student_profile, student_address, and student_guardian are all shared
//    between TESDA and SHS - one function each, used by both detail services
// => student_address is keyed by student_id, not profile_id
//
export const getProfileByStudentId = async (pool, studentId) => {
  const result = await pool.query(
    `SELECT * FROM student_profile WHERE student_id = $1 LIMIT 1`,
    [studentId]
  );
  return result.rows[0] ?? null;
};

export const getAddressByStudentId = async (pool, studentId) => {
  const result = await pool.query(
    `SELECT street, barangay_code, city_code, province_code, district_code, region_code
       FROM student_address WHERE student_id = $1 LIMIT 1`,
    [studentId]
  );
  return result.rows[0] ?? null;
};

// => student_guardian only has a row when the enrollee was a minor at
//    submission time - null result is expected and normal for adult enrollees
export const getGuardianByStudentId = async (pool, studentId) => {
  const result = await pool.query(
    `SELECT guardian_name, guardian_address, guardian_contact_no
       FROM student_guardian WHERE student_id = $1 LIMIT 1`,
    [studentId]
  );
  return result.rows[0] ?? null;
};

//
// GENERIC PARTIAL UPDATE HELPER
// => Column names can't be parameterized with $ placeholders, so every
//    caller MUST pass in its own whitelist Set of editable columns.
//    Any key in `fields` not on that whitelist is silently dropped - this
//    is the actual injection guard, not just a nice-to-have.
// => Refactored to take the allowed-columns Set as a parameter instead of
//    a table-name lookup, so tesdaEnrollmentModel.js and
//    shsEnrollmentModel.js can each own their own whitelist without this
//    shared file needing to know about their columns.
//
export const buildPartialUpdate = (table, idColumn, idValue, fields, allowedColumns) => {
  const keys = Object.keys(fields).filter(k => allowedColumns.has(k));
  if (keys.length === 0) return null;

  const setClauses = keys.map((k, i) => `${k} = $${i + 1}`);
  const values      = keys.map(k => fields[k]);
  values.push(idValue);

  return {
    text: `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${idColumn} = $${keys.length + 1} RETURNING *`,
    values,
  };
};

// => student_profile editable columns - shared whitelist since both TESDA
//    and SHS section handlers write to the same table
export const STUDENT_PROFILE_COLUMNS = new Set([
  'last_name', 'first_name', 'middle_name', 'name_extension',
  'contact_no', 'facebook_link', 'email', 'nationality', 'sex',
  'civil_status', 'employment_status', 'birth_date',
  'birthplace_region', 'birthplace_province', 'birthplace_city',
  'highest_educ_attainment', 'religion', 'religion_others',
]);

// => student_address editable columns - same reasoning as above
export const STUDENT_ADDRESS_COLUMNS = new Set([
  'street', 'barangay_code', 'city_code', 'province_code',
  'district_code', 'region_code',
]);

//
// SHARED PROFILE / ADDRESS UPDATES
// => Used by both TESDA and SHS routes, since both tables are shared
//    identity data - one implementation, called from both type services
//
export const updateProfile = async (pool, studentId, fields) => {
  const query = buildPartialUpdate('student_profile', 'student_id', studentId, fields, STUDENT_PROFILE_COLUMNS);
  if (!query) return null;
  const result = await pool.query(query.text, query.values);
  return result.rows[0] ?? null;
};

export const updateAddress = async (pool, studentId, fields) => {
  const query = buildPartialUpdate('student_address', 'student_id', studentId, fields, STUDENT_ADDRESS_COLUMNS);
  if (!query) return null;
  const result = await pool.query(query.text, query.values);
  return result.rows[0] ?? null;
};

// => Guardian is an upsert, not a plain update - a row may not exist yet
//    (student was an adult at submission, or the section was left blank).
// => ASSUME: PK column is guardian_id and there's no UNIQUE constraint on
//    student_id confirmed, so this does an explicit check-then-write
//    instead of ON CONFLICT.
export const upsertGuardian = async (pool, studentId, { guardian_name, guardian_address, guardian_contact_no }) => {
  const existing = await pool.query(
    `SELECT guardian_id FROM student_guardian WHERE student_id = $1 LIMIT 1`,
    [studentId]
  );

  if (existing.rows[0]) {
    const result = await pool.query(
      `UPDATE student_guardian
          SET guardian_name = $1, guardian_address = $2, guardian_contact_no = $3
        WHERE student_id = $4
        RETURNING *`,
      [guardian_name ?? null, guardian_address ?? null, guardian_contact_no ?? null, studentId]
    );
    return result.rows[0];
  }

  const result = await pool.query(
    `INSERT INTO student_guardian (student_id, guardian_name, guardian_address, guardian_contact_no)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
    [studentId, guardian_name ?? null, guardian_address ?? null]
  );
  return result.rows[0];
};
