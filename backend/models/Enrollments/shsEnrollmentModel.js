// => admin/models/Enrollments/shsEnrollmentModel.js
// => Split out of the old adminEnrollmentModel.js - this file holds only
//    SHS-specific queries. Shared student_profile/address/guardian
//    lookups and the buildPartialUpdate helper live in
//    sharedEnrollmentModel.js and are imported below.
// => All queries receive `pool` as a param - mirrors adminClassModel.js pattern

import { buildPartialUpdate } from './sharedEnrollmentModel.js';

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
        e.cluster_id,
        sc.name                                              AS cluster,
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
        cl.public_id                                          AS batch_public_id,
        cl.batch_name,
        cl.start_date,
        cl.end_date,
        cl.groupchat_link,
        sa.username                                          AS student_username
      FROM shs_enrollments e
      JOIN  student_accounts sa    ON sa.student_id = e.student_id
      LEFT JOIN shs_batches cl     ON cl.batch_id   = e.batch_id
      LEFT JOIN shs_clusters sc    ON sc.cluster_id = e.cluster_id
      WHERE e.public_id = $1`,
    [publicId]
  );
  return result.rows[0] ?? null;
};

//
// SHS CLUSTER CURRICULUM: read-only G11/G12 course list for admin display -
//   looked up directly by enrollment.cluster_id now that shs_enrollments is
//   FK-linked to shs_clusters, no more name matching needed. A cluster is a
//   fixed 2-year curriculum; the student never picks an individual course,
//   so this is purely informational context on the detail page, never
//   edited from here.
//
export const getClusterCourses = async (pool, clusterId) => {
  if (!clusterId) return [];
  const result = await pool.query(
    `SELECT sc.course_id, sc.title, sc.description, sc.grade_level, sc.course_link
       FROM shs_courses sc
      WHERE sc.cluster_id = $1
        AND sc.status = 'active'
        AND sc.deleted_at IS NULL
      ORDER BY sc.grade_level ASC, sc.title ASC`,
    [clusterId]
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

// => remarks is optional (nullable) - admin may change status without a note
// => externalRemarks is saved ONLY here, together with the status - never
//    through the generic /enrollment PATCH. Same reasoning as the TESDA
//    version of this function.
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

// => Same lock + capacity + sweep pattern as approveTesdaEnrollmentWithLock
//    in tesdaEnrollmentModel.js - see that function's comments for the
//    full reasoning. SHS has no payment gate, so this is purely the
//    capacity side of approval.
export const approveShsEnrollmentWithLock = async (pool, publicId, batchId, externalRemarks) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('SELECT pg_advisory_xact_lock($1)', [batchId]);

    const batchResult = await client.query(
      `SELECT max_students FROM shs_batches WHERE batch_id = $1`,
      [batchId]
    );
    const batch = batchResult.rows[0];
    if (!batch) throw new Error('Batch not found.');

    const countResult = await client.query(
      `SELECT COUNT(*)::int AS approved_count
         FROM shs_enrollments
        WHERE batch_id = $1 AND status = 'Approved'`,
      [batchId]
    );
    const approvedCount = countResult.rows[0].approved_count;

    if (approvedCount >= batch.max_students) {
      throw new Error('This batch is already full - Approved enrollments have reached max_students.');
    }

    const updateResult = await client.query(
      `UPDATE shs_enrollments
          SET status = 'Approved', external_remarks = $1, updated_at = NOW()
        WHERE public_id = $2
        RETURNING public_id, status, external_remarks`,
      [externalRemarks ?? null, publicId]
    );
    const updated = updateResult.rows[0];

    let sweptEnrollments = [];
    if (approvedCount + 1 >= batch.max_students) {
      // => Same reasoning as the TESDA version - Needs Clarification is
      //    still pre-Approved, not terminal, so it gets swept too
      const sweepResult = await client.query(
        `UPDATE shs_enrollments
            SET batch_id = NULL, status = 'Reserved', updated_at = NOW()
          WHERE batch_id = $1 AND status IN ('Pending', 'Reviewed', 'Needs Clarification')
          RETURNING public_id, enrollment_id, student_id`,
        [batchId]
      );
      sweptEnrollments = sweepResult.rows;
    }

    await client.query('COMMIT');
    return { updated, sweptEnrollments };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// => shs_enrollments editable columns - status is deliberately excluded,
//    same reasoning as TESDA_ENROLLMENT_COLUMNS in tesdaEnrollmentModel.js
// => cluster_id deliberately excluded - permanently locked once submitted,
//    same reasoning as course_id on the TESDA side
const SHS_ENROLLMENT_COLUMNS = new Set([
  'lrn', 'batch_id',
  'last_school_attended', 'school_address',
  'grade_level_completed', 'school_year_completed',
  'electives',
  'emergency_name', 'emergency_relationship', 'emergency_contact_no', 'emergency_address',
  'has_medical_condition', 'medical_condition_detail', 'allergies', 'maintenance_medication',
  'internal_remarks',
]);

export const updateShsEnrollmentFields = async (pool, publicId, fields) => {
  const query = buildPartialUpdate('shs_enrollments', 'public_id', publicId, fields, SHS_ENROLLMENT_COLUMNS);
  if (!query) return null;
  const result = await pool.query(query.text, query.values);
  return result.rows[0] ?? null;
};

//
// FAMILY MEMBERS - replace-all pattern, same reasoning as classifications
//   on the TESDA side
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
// DOCUMENTS - add new / replace existing file
// => R2 upload itself happens in the controller (needs req.file from
//    multer) - these functions only persist the resulting key
//
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

export const replaceShsDocument = async (pool, docPublicId, documentKey) => {
  const result = await pool.query(
    `UPDATE shs_documents SET document_key = $1, uploaded_at = NOW()
       WHERE public_id = $2
       RETURNING public_id, document_type, document_key, uploaded_at, enrollment_id`,
    [documentKey, docPublicId]
  );
  return result.rows[0] ?? null;
};

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
    `DELETE FROM shs_documents WHERE public_id = $1 RETURNING public_id, enrollment_id, document_type`,
    [docPublicId]
  );
  return { deleted: result.rows[0] };
};

// => shs_batches is filtered by track/cluster only, mirroring how the
//    student-side /api/shs-classes endpoint filters. Verify against your
//    actual schema.
export const getAvailableShsClasses = async (pool, { clusterId }) => {
  const result = await pool.query(
    `SELECT batch_id, batch_name, start_date, end_date, groupchat_link
       FROM shs_batches
       WHERE cluster_id = $1
       ORDER BY start_date ASC`,
    [clusterId]
  );
  return result.rows;
};

// => Returns SHS tracks and clusters together in one round trip - both are
//    small, static-ish reference tables, so no pagination/filtering needed
export const getShsTracksAndClusters = async (pool) => {
  // => value column dropped, name is the sole identifying label now
  const clustersResult = await pool.query(
    `SELECT cluster_id, name FROM shs_clusters ORDER BY cluster_id`
  );
  return { clusters: clustersResult.rows };
};
