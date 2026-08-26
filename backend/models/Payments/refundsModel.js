// => Raw SQL only, no business logic here. pool is used for the
// => multi-step transactions (create, void); sql is used for read-only
// => queries.
import { pool, sql } from '../../config/db.js';

// => Active TESDA courses for the Course filter dropdown, duplicated
// => from paymentsModel.js per the project's no-shared-abstraction policy.
export async function findTesdaCourseOptions() {
  const result = await sql`
    SELECT course_id, title
    FROM tesda_courses
    WHERE status = 'active'
    ORDER BY title ASC
  `;

  return result.rows;
}

// => Enrollments eligible for a refund: TESDA Regular, non-scholar,
// => with at least one Completed payment and a positive refundable
// => balance (total paid minus total already refunded).
// => Search matches student name or email (student_profile) - not course
// => title, since for refunds the admin is looking up a specific student
// => they already know, not browsing by course.
export async function findRefundableEnrollments(searchTerm) {
  const term = `%${searchTerm || ''}%`;

  const result = await sql`
    SELECT
      te.enrollment_id,
      te.public_id,
      te.fee_at_enrollment,
      COALESCE(tesda_fee.total_misc_fee, 0) AS total_misc_fee,
      tb.batch_name,
      tc.title AS course_title,
      sp.first_name,
      sp.last_name,
      sp.middle_name,
      sp.email,
      COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'Completed'), 0) AS total_paid,
      COALESCE(SUM(r.amount) FILTER (WHERE r.status = 'Completed'), 0) AS total_refunded
    FROM tesda_enrollments te
    JOIN tesda_batches tb ON tb.batch_id = te.batch_id
    LEFT JOIN tesda_courses tc ON tc.course_id = te.course_id
    LEFT JOIN student_profile sp ON sp.student_id = te.student_id
    LEFT JOIN payments p ON p.enrollment_id = te.enrollment_id
    LEFT JOIN refunds r ON r.enrollment_id = te.enrollment_id
    LEFT JOIN LATERAL (
      SELECT SUM(fee_amount) AS total_misc_fee
      FROM batch_misc_fees
      WHERE batch_type = 'TESDA' AND batch_id = tb.batch_id
    ) tesda_fee ON true
    WHERE tb.class_type = 'Regular'
      AND te.is_tesda_scholar = FALSE
      AND (
        sp.first_name ILIKE ${term}
        OR sp.last_name ILIKE ${term}
        OR sp.email ILIKE ${term}
      )
    GROUP BY te.enrollment_id, tb.batch_name, tc.title, sp.first_name, sp.last_name, sp.middle_name, sp.email, tesda_fee.total_misc_fee
    HAVING COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'Completed'), 0)
         - COALESCE(SUM(r.amount) FILTER (WHERE r.status = 'Completed'), 0) > 0
    ORDER BY sp.last_name ASC
    LIMIT 20
  `;

  return result.rows;
}

// => SHS counterpart to findRefundableEnrollments - batch must be
// => assigned, that batch must actually have at least one misc fee
// => configured, and the student must have a positive refundable balance
// => (completed payments minus completed refunds already issued).
export async function findRefundableShsEnrollments(searchTerm) {
  const term = `%${searchTerm || ''}%`;

  const result = await sql`
    SELECT
      se.enrollment_id,
      se.public_id,
      se.batch_id,
      sb.batch_name,
      sc.name AS cluster_name,
      sp.first_name,
      sp.last_name,
      sp.middle_name,
      sp.email,
      COALESCE(fee_totals.total_misc_fee, 0) AS total_misc_fee,
      COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'Completed'), 0) AS total_paid,
      COALESCE(SUM(r.amount) FILTER (WHERE r.status = 'Completed'), 0) AS total_refunded
    FROM shs_enrollments se
    JOIN shs_batches sb ON sb.batch_id = se.batch_id
    LEFT JOIN shs_clusters sc ON sc.cluster_id = se.cluster_id
    LEFT JOIN student_profile sp ON sp.student_id = se.student_id
    LEFT JOIN payments p ON p.enrollment_type = 'SHS' AND p.enrollment_id = se.enrollment_id
    LEFT JOIN refunds r ON r.enrollment_type = 'SHS' AND r.enrollment_id = se.enrollment_id
    LEFT JOIN LATERAL (
      SELECT SUM(fee_amount) AS total_misc_fee
      FROM batch_misc_fees
      WHERE batch_type = 'SHS' AND batch_id = se.batch_id
    ) fee_totals ON true
    WHERE se.batch_id IS NOT NULL
      AND (
        sp.first_name ILIKE ${term}
        OR sp.last_name ILIKE ${term}
        OR sp.email ILIKE ${term}
      )
    GROUP BY se.enrollment_id, sb.batch_name, sc.name, sp.first_name, sp.last_name, sp.middle_name, sp.email, fee_totals.total_misc_fee
    HAVING COALESCE(fee_totals.total_misc_fee, 0) > 0
       AND COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'Completed'), 0)
         - COALESCE(SUM(r.amount) FILTER (WHERE r.status = 'Completed'), 0) > 0
    ORDER BY sp.last_name ASC
    LIMIT 20
  `;

  return result.rows;
}

// => SHS counterpart to lockEnrollmentForRefund. No class_type check -
// => that's TESDA-only. total_misc_fee stands in for fee_at_enrollment as
// => "the full amount owed," used for percentage-based refund math.
export async function lockShsEnrollmentForRefund(client, enrollmentId) {
  const lockResult = await client.query(
    `SELECT enrollment_id, batch_id
     FROM shs_enrollments
     WHERE enrollment_id = $1
     FOR UPDATE`,
    [enrollmentId]
  );

  const enrollment = lockResult.rows[0];
  if (!enrollment) return null;
  if (!enrollment.batch_id) {
    return { enrollment_id: enrollment.enrollment_id, batch_id: null, total_misc_fee: 0, total_paid: 0, total_refunded: 0 };
  }

  const feeResult = await client.query(
    `SELECT COALESCE(SUM(fee_amount), 0) AS total_misc_fee
     FROM batch_misc_fees
     WHERE batch_type = 'SHS' AND batch_id = $1`,
    [enrollment.batch_id]
  );

  const paidResult = await client.query(
    `SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'Completed'), 0) AS total_paid
     FROM payments
     WHERE enrollment_type = 'SHS' AND enrollment_id = $1`,
    [enrollmentId]
  );

  const refundedResult = await client.query(
    `SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'Completed'), 0) AS total_refunded
     FROM refunds
     WHERE enrollment_type = 'SHS' AND enrollment_id = $1`,
    [enrollmentId]
  );

  return {
    enrollment_id: enrollment.enrollment_id,
    batch_id: enrollment.batch_id,
    total_misc_fee: feeResult.rows[0].total_misc_fee,
    total_paid: paidResult.rows[0].total_paid,
    total_refunded: refundedResult.rows[0].total_refunded
  };
}

// => Locks the enrollment row for the duration of the transaction, then
// => resolves fee/total_paid/total_refunded in separate plain queries.
// => Postgres rejects FOR UPDATE combined with GROUP BY/aggregates in the
// => same statement ("FOR UPDATE is not allowed with GROUP BY clause"),
// => so this can't be one query like the old version tried. Same split
// => pattern as lockShsEnrollmentForRefund above.
export async function lockEnrollmentForRefund(client, enrollmentId) {
  const lockResult = await client.query(
    `SELECT te.enrollment_id, te.fee_at_enrollment, te.batch_id, tb.class_type
     FROM tesda_enrollments te
     JOIN tesda_batches tb ON tb.batch_id = te.batch_id
     WHERE te.enrollment_id = $1
     FOR UPDATE OF te`,
    [enrollmentId]
  );

  const enrollment = lockResult.rows[0];
  if (!enrollment) return null;

  const feeResult = await client.query(
    `SELECT COALESCE(SUM(fee_amount), 0) AS total_misc_fee
     FROM batch_misc_fees
     WHERE batch_type = 'TESDA' AND batch_id = $1`,
    [enrollment.batch_id]
  );

  const paidResult = await client.query(
    `SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'Completed'), 0) AS total_paid
     FROM payments
     WHERE enrollment_id = $1`,
    [enrollmentId]
  );

  const refundedResult = await client.query(
    `SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'Completed'), 0) AS total_refunded
     FROM refunds
     WHERE enrollment_id = $1`,
    [enrollmentId]
  );

  return {
    enrollment_id: enrollment.enrollment_id,
    fee_at_enrollment: enrollment.fee_at_enrollment,
    class_type: enrollment.class_type,
    total_misc_fee: feeResult.rows[0].total_misc_fee,
    total_paid: paidResult.rows[0].total_paid,
    total_refunded: refundedResult.rows[0].total_refunded
  };
}

// => enrollment_type must be written explicitly now that SHS refunds are
// => real - previously this relied on the column's 'TESDA' default,
// => which was harmless only because no SHS refund could ever be created
// => before this feature existed. Leaving it implicit now would silently
// => mis-tag every SHS refund as TESDA, breaking the type-aware joins in
// => findRefundByPublicId / listRefunds.
export async function insertRefund(client, { enrollmentType, enrollmentId, refundType, percentageValue, amount, reason, remarks, createdBy }) {
  const result = await client.query(
    `INSERT INTO refunds (enrollment_type, enrollment_id, refund_type, percentage_value, amount, reason, remarks, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [enrollmentType, enrollmentId, refundType, percentageValue || null, amount, reason, remarks || null, createdBy]
  );

  return result.rows[0];
}

export async function insertActivityLog(client, { entityType, entityId, actorId, actorName, action, actionDetail }) {
  // => activity_logs_actor_type_check only allows 'Staff', 'Student', 'System'.
  // => An admin acting in the system is logged as 'Staff', not 'Admin'.
  await client.query(
    `INSERT INTO activity_logs (entity_type, entity_id, actor_type, actor_id, actor_name, action, action_detail)
     VALUES ($1, $2, 'Staff', $3, $4, $5, $6)`,
    [entityType, entityId, actorId, actorName, action, actionDetail]
  );
}

// => Paginated list, 10 per page by default. status filter optional
// => ('Completed' | 'Voided'); courseId filters by enrollment's TESDA
// => course; search matches refund number or student name. Same dual-
// => LEFT-JOIN pattern as paymentsModel.js's listPayments.
export async function listRefunds({ page, limit, status, courseId, search }) {
  const offset = (page - 1) * limit;
  const term = `%${search || ''}%`;

  const rows = await sql`
    SELECT
      r.refund_id,
      r.public_id,
      r.refund_number,
      r.amount,
      r.refund_type,
      r.status,
      r.created_at,
      r.enrollment_type,
      sp.first_name,
      sp.last_name,
      sp.middle_name,
      COALESCE(tb.batch_name, sb.batch_name) AS batch_name,
      COALESCE(tb.batch_sequence, sb.batch_sequence) AS batch_sequence
    FROM refunds r
    LEFT JOIN tesda_enrollments te ON te.enrollment_id = r.enrollment_id AND r.enrollment_type = 'TESDA'
    LEFT JOIN tesda_batches tb ON tb.batch_id = te.batch_id
    LEFT JOIN shs_enrollments se ON se.enrollment_id = r.enrollment_id AND r.enrollment_type = 'SHS'
    LEFT JOIN shs_batches sb ON sb.batch_id = se.batch_id
    LEFT JOIN student_profile sp ON sp.student_id = COALESCE(te.student_id, se.student_id)
    WHERE (${status}::text IS NULL OR r.status = ${status})
      AND (${courseId}::int IS NULL OR te.course_id = ${courseId})
      AND (
        ${search}::text IS NULL
        OR r.refund_number ILIKE ${term}
        OR sp.first_name ILIKE ${term}
        OR sp.last_name ILIKE ${term}
      )
    ORDER BY r.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countResult = await sql`
    SELECT COUNT(*)::int AS total
    FROM refunds r
    LEFT JOIN tesda_enrollments te ON te.enrollment_id = r.enrollment_id AND r.enrollment_type = 'TESDA'
    LEFT JOIN shs_enrollments se ON se.enrollment_id = r.enrollment_id AND r.enrollment_type = 'SHS'
    LEFT JOIN student_profile sp ON sp.student_id = COALESCE(te.student_id, se.student_id)
    WHERE (${status}::text IS NULL OR r.status = ${status})
      AND (${courseId}::int IS NULL OR te.course_id = ${courseId})
      AND (
        ${search}::text IS NULL
        OR r.refund_number ILIKE ${term}
        OR sp.first_name ILIKE ${term}
        OR sp.last_name ILIKE ${term}
      )
  `;

  return { rows: rows.rows, total: countResult.rows[0].total };
}

// => Full detail row, used by RefundDetail and any future PDF receipt
// => Same dual-LEFT-JOIN pattern as paymentsModel.js's findPaymentByPublicId
// => - createRefund is TESDA-only today, so every real row currently has
// => enrollment_type = 'TESDA' via the column default, but this stays
// => correct the moment SHS refunds get supported instead of silently
// => breaking on the same enrollment_id-collision risk.
export async function findRefundByPublicId(publicId) {
  const result = await sql`
    SELECT
      r.*,
      COALESCE(te.public_id, se.public_id) AS enrollment_public_id,
      sp.first_name,
      sp.last_name,
      sp.middle_name,
      sp.email AS student_email,
      creator.full_name AS created_by_name,
      voider.full_name AS voided_by_name,
      te.fee_at_enrollment,
      tesda_fee.total_misc_fee AS tesda_total_misc_fee,
      tb.batch_name AS tesda_batch_name,
      tb.batch_sequence AS tesda_batch_sequence,
      sb.batch_name AS shs_batch_name,
      sb.batch_sequence AS shs_batch_sequence,
      shs_fee.total_misc_fee AS shs_total_misc_fee
    FROM refunds r
    LEFT JOIN tesda_enrollments te ON te.enrollment_id = r.enrollment_id AND r.enrollment_type = 'TESDA'
    LEFT JOIN tesda_batches tb ON tb.batch_id = te.batch_id
    LEFT JOIN LATERAL (
      SELECT SUM(fee_amount) AS total_misc_fee
      FROM batch_misc_fees
      WHERE batch_type = 'TESDA' AND batch_id = tb.batch_id
    ) tesda_fee ON r.enrollment_type = 'TESDA'
    LEFT JOIN shs_enrollments se ON se.enrollment_id = r.enrollment_id AND r.enrollment_type = 'SHS'
    LEFT JOIN shs_batches sb ON sb.batch_id = se.batch_id
    LEFT JOIN LATERAL (
      SELECT SUM(fee_amount) AS total_misc_fee
      FROM batch_misc_fees
      WHERE batch_type = 'SHS' AND batch_id = sb.batch_id
    ) shs_fee ON r.enrollment_type = 'SHS'
    LEFT JOIN student_profile sp ON sp.student_id = COALESCE(te.student_id, se.student_id)
    LEFT JOIN admins creator ON creator.admin_id = r.created_by
    LEFT JOIN admins voider ON voider.admin_id = r.voided_by
    WHERE r.public_id = ${publicId}
  `;

  return result.rows[0] || null;
}

export async function findRefundIdByPublicId(client, publicId) {
  const result = await client.query(
    `SELECT refund_id, enrollment_id, status FROM refunds WHERE public_id = $1 FOR UPDATE`,
    [publicId]
  );

  return result.rows[0] || null;
}

export async function voidRefundRow(client, { refundId, voidReason, voidedBy }) {
  const result = await client.query(
    `UPDATE refunds
     SET status = 'Voided', void_reason = $1, voided_by = $2, voided_at = NOW()
     WHERE refund_id = $3
     RETURNING *`,
    [voidReason, voidedBy, refundId]
  );

  return result.rows[0];
}

// => Refund rows for a single enrollment's Payment History section.
// => Same enrollmentType reasoning as paymentsModel's equivalent function.
export async function findRefundsForEnrollment(enrollmentType, enrollmentId) {
  const result = await sql`
    SELECT public_id, refund_number, amount, created_at, status
    FROM refunds
    WHERE enrollment_type = ${enrollmentType} AND enrollment_id = ${enrollmentId}
    ORDER BY created_at DESC
  `;

  return result.rows;
}

// => Refund rows across BOTH TESDA and SHS enrollments for one student.
// => Same enrollmentType/join reasoning as paymentsModel's equivalent.
export async function findRefundsForStudent(studentId) {
  const result = await sql`
    SELECT r.public_id, r.refund_number, r.amount, r.created_at, r.status,
           'TESDA' AS program_type
    FROM refunds r
    JOIN tesda_enrollments te ON te.enrollment_id = r.enrollment_id
    WHERE r.enrollment_type = 'TESDA' AND te.student_id = ${studentId}

    UNION ALL

    SELECT r.public_id, r.refund_number, r.amount, r.created_at, r.status,
           'SHS' AS program_type
    FROM refunds r
    JOIN shs_enrollments se ON se.enrollment_id = r.enrollment_id
    WHERE r.enrollment_type = 'SHS' AND se.student_id = ${studentId}
  `;

  return result.rows;
}
