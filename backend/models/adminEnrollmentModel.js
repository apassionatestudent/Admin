// => admin/models/adminEnrollmentModel.js
// => FULL REWRITE - the previous version queried a pre-split schema that no
//    longer exists (enrollment, enrollment_documents, classes, sp.surname).
//    Rebuilt against the current tesda_enrollments / shs_enrollments split.
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
        e.cluster
      FROM shs_enrollments e
      JOIN  student_accounts sa    ON sa.student_id  = e.student_id
      LEFT JOIN student_profile sp ON sp.student_id  = e.student_id
      LEFT JOIN shs_batches cl     ON cl.batch_id    = e.batch_id
      WHERE e.status IN ('Pending', 'Needs Clarification')

      ORDER BY submitted_at ASC`
  );
  return result.rows;
};

// 
// SEARCH: across ALL statuses, both TESDA and SHS, by email or profile name
// => Same UNION ALL shape as the list query above
// => Filter key stays "surname" to match the existing frontend/controller
//    contract - it filters against sp.last_name under the hood
// 
export const searchEnrollments = async (pool, { email, first_name, middle_name, surname, name_extension }) => {
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
          e.cluster
        FROM shs_enrollments e
        JOIN  student_accounts sa    ON sa.student_id  = e.student_id
        LEFT JOIN student_profile sp ON sp.student_id  = e.student_id
        LEFT JOIN shs_batches cl     ON cl.batch_id    = e.batch_id
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
        surname        || null,
        name_extension || null,
      ]
    );
    return rows.rows;
  } finally {
    client.release();
  }
};

// 
// TESDA DETAIL: enrollment row + course/sector (direct or via class)
//   + class period/type/groupchat from the joined tesda_batches row
// 
export const getTesdaEnrollmentDetailByPublicId = async (pool, publicId) => {
  const result = await pool.query(
    `SELECT
        e.public_id,
        e.enrollment_id,
        e.student_id,
        e.course_id,
        e.batch_id,
        e.fee_at_enrollment,
        e.uli,
        e.ncae_taken,
        e.ncae_where,
        e.ncae_when,
        e.is_tesda_scholar,
        e.scholarship_type,
        e.other_scholarship,
        e.status,
        e.submitted_at,
        e.updated_at,
        c.title                                              AS course_name,
        s.sector                                             AS sector,
        cl.start_date,
        cl.end_date,
        cl.class_type,
        cl.groupchat_link,
        e.internal_remarks,
        e.external_remarks,
        sa.username                                          AS student_username
      FROM tesda_enrollments e
      JOIN  student_accounts sa    ON sa.student_id = e.student_id
      LEFT JOIN tesda_courses c          ON c.course_id   = e.course_id
      LEFT JOIN sectors s          ON s.sector_id   = c.sector_id
      LEFT JOIN tesda_batches cl   ON cl.batch_id   = e.batch_id
      WHERE e.public_id = $1`,
    [publicId]
  );
  return result.rows[0] ?? null;
};

// 
// SHS DETAIL: enrollment row + class period/groupchat from the joined
//   shs_batches row
// 
export const getShsEnrollmentDetailByPublicId = async (pool, publicId) => {
  const result = await pool.query(
    `SELECT
        e.public_id,
        e.enrollment_id,
        e.student_id,
        e.lrn,
        e.batch_id,
        e.last_school_attended,
        e.school_address,
        e.grade_level_completed,
        e.school_year_completed,
        e.cluster,
        e.electives,
        e.emergency_name,
        e.emergency_relationship,
        e.emergency_contact_no,
        e.emergency_address,
        e.has_medical_condition,
        e.medical_condition_detail,
        e.allergies,
        e.maintenance_medication,
        e.internal_remarks,
        e.external_remarks,
        e.status,
        e.submitted_at,
        e.updated_at,
        -- => course_id/course_name join dropped: course_id is no longer
        --    written for new SHS enrollments (a cluster is a fixed 2-year
        --    curriculum, not a single course the student picks), and
        --    nothing in the frontend actually rendered course_name.
        --    Curriculum is now fetched separately by cluster - see
        --    getClusterCourses below.
        e.course_id,
        cl.start_date,
        cl.end_date,
        cl.groupchat_link,
        sa.username                                          AS student_username
      FROM shs_enrollments e
      JOIN  student_accounts sa    ON sa.student_id = e.student_id
      LEFT JOIN shs_batches cl     ON cl.batch_id   = e.batch_id
      WHERE e.public_id = $1`,
    [publicId]
  );
  return result.rows[0] ?? null;
};

// 
// SHS CLUSTER CURRICULUM: read-only G11/G12 course list for admin display -
//   looked up by enrollment.cluster (the shs_clusters.value string), NOT by
//   enrollment.course_id. A cluster is a fixed 2-year curriculum; the
//   student never picks an individual course, so this is purely
//   informational context on the detail page, never edited from here.
// 
export const getClusterCourses = async (pool, clusterValue) => {
  if (!clusterValue) return [];
  const result = await pool.query(
    `SELECT sc.course_id, sc.title, sc.description, sc.grade_level, sc.course_link
       FROM shs_courses sc
       JOIN shs_clusters cl ON cl.cluster_id = sc.cluster_id
      WHERE cl.value = $1
        AND sc.status = 'active'
        AND sc.deleted_at IS NULL
      ORDER BY sc.grade_level ASC, sc.title ASC`,
    [clusterValue]
  );
  return result.rows;
};

// 
// SHARED PROFILE / ADDRESS / GUARDIAN LOOKUPS
// => student_profile, student_address, and student_guardian are all shared
//    between TESDA and SHS - one function each, used by both detail services
// => FIX: student_address is keyed by student_id, not profile_id (that
//    column doesn't exist on this table - the old model queried it wrong)
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
// TESDA-ONLY: documents + client classifications
// 
export const getTesdaDocsByEnrollmentId = async (pool, enrollmentId) => {
  const result = await pool.query(
    `SELECT public_id, document_type, document_key, uploaded_at
       FROM tesda_documents
       WHERE enrollment_id = $1
       ORDER BY uploaded_at ASC`,
    [enrollmentId]
  );
  return result.rows;
};

export const getClassificationsByEnrollmentId = async (pool, enrollmentId) => {
  const result = await pool.query(
    `SELECT classification_id, classification_value, others_text
       FROM tesda_client_classifications
       WHERE enrollment_id = $1`,
    [enrollmentId]
  );
  return result.rows;
};

// 
// SHS-ONLY: documents + family members
// => family members are keyed by student_id (shared identity), not
//    enrollment_id - same reasoning as student_profile/student_address
// 
export const getShsDocsByEnrollmentId = async (pool, enrollmentId) => {
  const result = await pool.query(
    `SELECT public_id, document_type, document_key, uploaded_at
       FROM shs_documents
       WHERE enrollment_id = $1
       ORDER BY uploaded_at ASC`,
    [enrollmentId]
  );
  return result.rows;
};

export const getFamilyMembersByStudentId = async (pool, studentId) => {
  const result = await pool.query(
    `SELECT family_member_id, role, full_name, occupation, contact_no, relationship_to_student
       FROM shs_family_members
       WHERE student_id = $1
       ORDER BY CASE role WHEN 'Father' THEN 1 WHEN 'Mother' THEN 2 WHEN 'Guardian' THEN 3 END`,
    [studentId]
  );
  return result.rows;
};


// STATUS UPDATES - separate per type since they hit different tables

// => remarks is optional (nullable) - admin may change status without a note
// => externalRemarks is saved ONLY here, together with the status - never
//    through the generic /enrollment PATCH. That's what makes "clears on
//    status change, only persists when Save Status is confirmed" possible:
//    whatever the admin is typing never touches the DB until this fires.
export const updateTesdaEnrollmentStatus = async (pool, publicId, newStatus, externalRemarks) => {
  const result = await pool.query(
    `UPDATE tesda_enrollments
        SET status           = $1,
            external_remarks = $2,
            updated_at       = NOW()
      WHERE public_id        = $3
      RETURNING public_id, status, external_remarks`,
    [newStatus, externalRemarks ?? null, publicId]
  );
  return result.rows[0] ?? null;
};

export const updateShsEnrollmentStatus = async (pool, publicId, newStatus, externalRemarks) => {
  const result = await pool.query(
    `UPDATE shs_enrollments
        SET status           = $1,
            external_remarks = $2,
            updated_at       = NOW()
      WHERE public_id        = $3
      RETURNING public_id, status, external_remarks`,
    [newStatus, externalRemarks ?? null, publicId]
  );
  return result.rows[0] ?? null;
};

// 
// GENERIC PARTIAL UPDATE HELPER
// => Column names can't be parameterized with $ placeholders, so every
//    table using this MUST whitelist its editable columns here first.
//    Any key in `fields` not on the whitelist is silently dropped - this
//    is the actual injection guard, not just a nice-to-have.
// 
const ALLOWED_COLUMNS = {
  student_profile: new Set([
    'last_name', 'first_name', 'middle_name', 'name_extension',
    'contact_no', 'facebook_link', 'email', 'nationality', 'sex',
    'civil_status', 'employment_status', 'birth_date',
    'birthplace_region', 'birthplace_province', 'birthplace_city',
    'highest_educ_attainment', 'religion', 'religion_others',
  ]),
  student_address: new Set([
    'street', 'barangay_code', 'city_code', 'province_code',
    'district_code', 'region_code',
  ]),
  tesda_enrollments: new Set([
    'uli', 'course_id', 'batch_id', 'fee_at_enrollment',
    'ncae_taken', 'ncae_where', 'ncae_when',
    'is_tesda_scholar', 'scholarship_type', 'other_scholarship',
    'internal_remarks',
  ]),
  shs_enrollments: new Set([
    'lrn', 'batch_id',
    'last_school_attended', 'school_address',
    'grade_level_completed', 'school_year_completed',
    'cluster', 'electives',
    'emergency_name', 'emergency_relationship', 'emergency_contact_no', 'emergency_address',
    'has_medical_condition', 'medical_condition_detail', 'allergies', 'maintenance_medication',
    'internal_remarks',
  ]),
};

// => status is deliberately excluded from both enrollment whitelists - it
//    already has its own dedicated PATCH .../status endpoint with its own
//    ALLOWED_STATUSES validation in the service layer. Don't let it slip
//    in through the generic field editor and bypass that check.
const buildPartialUpdate = (table, idColumn, idValue, fields) => {
  const allowed = ALLOWED_COLUMNS[table];
  const keys = Object.keys(fields).filter(k => allowed.has(k));
  if (keys.length === 0) return null;

  const setClauses = keys.map((k, i) => `${k} = $${i + 1}`);
  const values      = keys.map(k => fields[k]);
  values.push(idValue);

  return {
    text: `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${idColumn} = $${keys.length + 1} RETURNING *`,
    values,
  };
};

// 
// SHARED PROFILE / ADDRESS UPDATES
// => Used by both TESDA and SHS routes, since both tables are shared
//    identity data - one implementation, called from both section handlers
// 
export const updateProfile = async (pool, studentId, fields) => {
  const query = buildPartialUpdate('student_profile', 'student_id', studentId, fields);
  if (!query) return null;
  const result = await pool.query(query.text, query.values);
  return result.rows[0] ?? null;
};

export const updateAddress = async (pool, studentId, fields) => {
  const query = buildPartialUpdate('student_address', 'student_id', studentId, fields);
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

// 
// TESDA / SHS ENROLLMENT FIELD UPDATES
// => One function each, covers every editable column on that table
// 
export const updateTesdaEnrollmentFields = async (pool, publicId, fields) => {
  const query = buildPartialUpdate('tesda_enrollments', 'public_id', publicId, fields);
  if (!query) return null;
  const result = await pool.query(query.text, query.values);
  return result.rows[0] ?? null;
};

export const updateShsEnrollmentFields = async (pool, publicId, fields) => {
  const query = buildPartialUpdate('shs_enrollments', 'public_id', publicId, fields);
  if (!query) return null;
  const result = await pool.query(query.text, query.values);
  return result.rows[0] ?? null;
};

// 
// CLASSIFICATIONS - replace-all pattern (delete existing, insert the new
//   set) since it's a checkbox list, not individually addressable rows
// 
export const replaceClassifications = async (pool, enrollmentId, classifications, othersText) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM tesda_client_classifications WHERE enrollment_id = $1`,
      [enrollmentId]
    );
    for (const value of classifications) {
      await client.query(
        `INSERT INTO tesda_client_classifications (enrollment_id, classification_value, others_text)
           VALUES ($1, $2, $3)`,
        [enrollmentId, value, value === 'others' ? (othersText || null) : null]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// 
// FAMILY MEMBERS - replace-all pattern, same reasoning as classifications
// => Keyed by student_id, not enrollment_id
// => The DEFERRABLE constraint trigger (both-parents-or-guardian) checks
//    at COMMIT, after every row in this transaction has landed
// 
export const replaceFamilyMembers = async (pool, studentId, members) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM shs_family_members WHERE student_id = $1`,
      [studentId]
    );
    for (const m of members) {
      await client.query(
        `INSERT INTO shs_family_members
           (student_id, role, full_name, occupation, contact_no, relationship_to_student)
           VALUES ($1, $2, $3, $4, $5, $6)`,
        [studentId, m.role, m.full_name, m.occupation || null, m.contact_no || null, m.relationship_to_student || null]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// 
// DOCUMENTS - add new / replace existing file, per type
// => R2 upload itself happens in the controller (needs req.file from
//    multer) - these functions only persist the resulting key
// 
export const addTesdaDocument = async (pool, enrollmentId, { documentType, documentKey }) => {
  const result = await pool.query(
    // => is_original explicitly FALSE - admin-added docs are deletable,
    //    unlike student-submitted ones (see insertEnrollmentDocuments)
    `INSERT INTO tesda_documents (enrollment_id, document_type, document_key, uploaded_at, is_original)
       VALUES ($1, $2, $3, NOW(), FALSE)
       RETURNING public_id, document_type, document_key, uploaded_at, is_original`,
    [enrollmentId, documentType, documentKey]
  );
  return result.rows[0];
};

export const replaceTesdaDocument = async (pool, docPublicId, documentKey) => {
  const result = await pool.query(
    `UPDATE tesda_documents SET document_key = $1, uploaded_at = NOW()
       WHERE public_id = $2
       RETURNING public_id, document_type, document_key, uploaded_at`,
    [documentKey, docPublicId]
  );
  return result.rows[0] ?? null;
};

// Add SHS document by public_id
// Add SHS document by public_id
export const addShsDocument = async (pool, enrollmentId, { documentType, documentKey }) => {
  const result = await pool.query(
    // => is_original explicitly FALSE - same reasoning as addTesdaDocument
    `INSERT INTO shs_documents (enrollment_id, document_type, document_key, uploaded_at, is_original)
       VALUES ($1, $2, $3, NOW(), FALSE)
       RETURNING public_id, document_type, document_key, uploaded_at, is_original`,
    [enrollmentId, documentType, documentKey]
  );
  return result.rows[0];
};
// Replace SHS document by public_id
export const replaceShsDocument = async (pool, docPublicId, documentKey) => {
  const result = await pool.query(
    `UPDATE shs_documents SET document_key = $1, uploaded_at = NOW()
       WHERE public_id = $2
       RETURNING public_id, document_type, document_key, uploaded_at`,
    [documentKey, docPublicId]
  );
  return result.rows[0] ?? null;
};

// Delete SHS document by public_id
// => Audit lock: check is_original BEFORE deleting. Returns a tagged
//    object so the controller can tell "not found" (404) apart from
//    "blocked, student-submitted original" (403) - a bare null/row
//    can't carry that distinction.
export const deleteShsDocument = async (pool, docPublicId) => {
  const check = await pool.query(
    `SELECT public_id, is_original FROM shs_documents WHERE public_id = $1`,
    [docPublicId]
  );
  const doc = check.rows[0];
  if (!doc) return { notFound: true };
  if (doc.is_original) return { blocked: true };

  const result = await pool.query(
    `DELETE FROM shs_documents WHERE public_id = $1 RETURNING public_id`,
    [docPublicId]
  );
  return { deleted: result.rows[0] };
};

// Delete TESDA document by public_id
// => Same is_original audit-lock pattern as deleteShsDocument above.
//    TESDA never had a delete path before this - this is new, not a patch.
export const deleteTesdaDocument = async (pool, docPublicId) => {
  const check = await pool.query(
    `SELECT public_id, is_original FROM tesda_documents WHERE public_id = $1`,
    [docPublicId]
  );
  const doc = check.rows[0];
  if (!doc) return { notFound: true };
  if (doc.is_original) return { blocked: true };

  const result = await pool.query(
    `DELETE FROM tesda_documents WHERE public_id = $1 RETURNING public_id`,
    [docPublicId]
  );
  return { deleted: result.rows[0] };
};

// => shs_batches is filtered by track/cluster only, mirroring how the
//    student-side /api/shs-classes endpoint filters. Verify against your
//    actual schema.
export const getAvailableShsClasses = async (pool, { cluster }) => {
  const result = await pool.query(
    `SELECT batch_id, start_date, end_date, groupchat_link
       FROM shs_batches
       WHERE cluster = $1
       ORDER BY start_date ASC`,
    [cluster]
  );
  return result.rows;
};

// => Returns SHS tracks and clusters together in one round trip - both are
//    small, static-ish reference tables, so no pagination/filtering needed
export const getShsTracksAndClusters = async (pool) => {
  const clustersResult = await pool.query(
    `SELECT cluster_id, value, name FROM shs_clusters ORDER BY cluster_id`
  );
  return { clusters: clustersResult.rows };
};


// => Mirrors getAvailableShsClasses - TESDA classes are filtered by
//    course only (Sector is derived from the course, not user-selectable)
export const getAvailableTesdaClasses = async (pool, { courseId }) => {
  const result = await pool.query(
    `SELECT batch_id, start_date, end_date, groupchat_link
       FROM tesda_batches
       WHERE course_id = $1
       ORDER BY start_date ASC`,
    [courseId]
  );
  return result.rows;
};