// => admin/models/Enrollments/tesdaEnrollmentModel.js
// => Split out of the old adminEnrollmentModel.js - this file holds only
//    TESDA-specific queries. Shared student_profile/address/guardian
//    lookups and the buildPartialUpdate helper live in
//    sharedEnrollmentModel.js and are imported below.
// => All queries receive `pool` as a param - mirrors adminClassModel.js pattern

import { buildPartialUpdate } from './sharedEnrollmentModel.js';

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
        cl.public_id                                          AS batch_public_id,
        cl.batch_name,
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

// => Approving into a batch is capacity-gated on Approved count only, per
//    the batch model change - Pending/Reviewed/Reserved no longer consume
//    a slot. pg_advisory_xact_lock on batch_id serializes concurrent
//    approvals into the same batch, so two staff can't both pass the
//    count check before either write commits, same pattern as the batch
//    create race protection.
// => If this approval fills the batch to max_students, every other
//    enrollment still sitting in Pending/Reviewed in this batch gets
//    swept back to Reserved (batch_id cleared) so they can be assigned
//    into a future batch instead of being stuck on one that can't fit them.
export const approveTesdaEnrollmentWithLock = async (pool, publicId, batchId, externalRemarks) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('SELECT pg_advisory_xact_lock($1)', [batchId]);

    const batchResult = await client.query(
      `SELECT max_students FROM tesda_batches WHERE batch_id = $1`,
      [batchId]
    );
    const batch = batchResult.rows[0];
    if (!batch) throw new Error('Batch not found.');

    const countResult = await client.query(
      `SELECT COUNT(*)::int AS approved_count
         FROM tesda_enrollments
        WHERE batch_id = $1 AND status = 'Approved'`,
      [batchId]
    );
    const approvedCount = countResult.rows[0].approved_count;

    if (approvedCount >= batch.max_students) {
      throw new Error('This batch is already full - Approved enrollments have reached max_students.');
    }

    const updateResult = await client.query(
      `UPDATE tesda_enrollments
          SET status = 'Approved', external_remarks = $1, updated_at = NOW()
        WHERE public_id = $2
        RETURNING public_id, status, external_remarks`,
      [externalRemarks ?? null, publicId]
    );
    const updated = updateResult.rows[0];

    let sweptEnrollments = [];
    if (approvedCount + 1 >= batch.max_students) {
      // => Needs Clarification is included alongside Pending/Reviewed -
      //    all three represent enrollments still trying to reach Approved,
      //    none of them terminal. Rejected/Dropped are deliberately left
      //    out since those students are already out of the pipeline.
      const sweepResult = await client.query(
        `UPDATE tesda_enrollments
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

// => tesda_enrollments editable columns - status is deliberately excluded,
//    it already has its own dedicated PATCH .../status endpoint with its
//    own ALLOWED_STATUSES validation in the service layer. Don't let it
//    slip in through the generic field editor and bypass that check.
const TESDA_ENROLLMENT_COLUMNS = new Set([
  'uli', 'course_id', 'batch_id', 'fee_at_enrollment',
  'ncae_taken', 'ncae_where', 'ncae_when',
  'is_tesda_scholar', 'scholarship_type', 'other_scholarship',
  'internal_remarks',
]);

export const updateTesdaEnrollmentFields = async (pool, publicId, fields) => {
  const query = buildPartialUpdate('tesda_enrollments', 'public_id', publicId, fields, TESDA_ENROLLMENT_COLUMNS);
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
// DOCUMENTS - add new / replace existing file
// => R2 upload itself happens in the controller (needs req.file from
//    multer) - these functions only persist the resulting key
//
export const addTesdaDocument = async (pool, enrollmentId, { documentType, documentKey }) => {
  const result = await pool.query(
    // => is_original explicitly FALSE - admin-added docs are deletable,
    //    unlike student-submitted ones
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

// => Audit lock: check is_original BEFORE deleting. Returns a tagged
//    object so the controller can tell "not found" (404) apart from
//    "blocked, student-submitted original" (403) - a bare null/row
//    can't carry that distinction.
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

// => Mirrors getAvailableShsClasses - TESDA classes are filtered by
//    course only (Sector is derived from the course, not user-selectable)
export const getAvailableTesdaClasses = async (pool, { courseId }) => {
  const result = await pool.query(
    `SELECT batch_id, batch_name, start_date, end_date, groupchat_link
       FROM tesda_batches
       WHERE course_id = $1
       ORDER BY start_date ASC`,
    [courseId]
  );
  return result.rows;
};
