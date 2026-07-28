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
    WHERE tb.class_type = 'Regular'
      AND te.is_tesda_scholar = FALSE
      AND (
        sp.first_name ILIKE ${term}
        OR sp.last_name ILIKE ${term}
        OR sp.email ILIKE ${term}
      )
    GROUP BY te.enrollment_id, tb.batch_name, tc.title, sp.first_name, sp.last_name, sp.middle_name, sp.email
    HAVING COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'Completed'), 0)
         - COALESCE(SUM(r.amount) FILTER (WHERE r.status = 'Completed'), 0) > 0
    ORDER BY sp.last_name ASC
    LIMIT 20
  `;

  return result.rows;
}

// => Locks the enrollment row for the duration of the transaction and
// => returns fee, total paid, and total already refunded.
export async function lockEnrollmentForRefund(client, enrollmentId) {
  const result = await client.query(
    `SELECT te.enrollment_id,
            te.fee_at_enrollment,
            tb.class_type,
            COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'Completed'), 0) AS total_paid,
            COALESCE(SUM(r.amount) FILTER (WHERE r.status = 'Completed'), 0) AS total_refunded
     FROM tesda_enrollments te
     JOIN tesda_batches tb ON tb.batch_id = te.batch_id
     LEFT JOIN payments p ON p.enrollment_id = te.enrollment_id
     LEFT JOIN refunds r ON r.enrollment_id = te.enrollment_id
     WHERE te.enrollment_id = $1
     GROUP BY te.enrollment_id, tb.class_type
     FOR UPDATE OF te`,
    [enrollmentId]
  );

  return result.rows[0] || null;
}

export async function insertRefund(client, { enrollmentId, refundType, percentageValue, amount, reason, remarks, createdBy }) {
  const result = await client.query(
    `INSERT INTO refunds (enrollment_id, refund_type, percentage_value, amount, reason, remarks, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [enrollmentId, refundType, percentageValue || null, amount, reason, remarks || null, createdBy]
  );

  return result.rows[0];
}

export async function insertActivityLog(client, { entityType, entityId, actorId, actorName, action, actionDetail }) {
  await client.query(
    `INSERT INTO activity_logs (entity_type, entity_id, actor_type, actor_id, actor_name, action, action_detail)
     VALUES ($1, $2, 'Admin', $3, $4, $5, $6)`,
    [entityType, entityId, actorId, actorName, action, actionDetail]
  );
}

// => Paginated list, 10 per page by default. status filter optional
// => ('Completed' | 'Voided'); courseId filters by enrollment's TESDA
// => course; search matches refund number or student name.
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
      tc.title AS course_title,
      sp.first_name,
      sp.last_name,
      sp.middle_name
    FROM refunds r
    JOIN tesda_enrollments te ON te.enrollment_id = r.enrollment_id
    LEFT JOIN tesda_courses tc ON tc.course_id = te.course_id
    LEFT JOIN student_profile sp ON sp.student_id = te.student_id
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
    JOIN tesda_enrollments te ON te.enrollment_id = r.enrollment_id
    LEFT JOIN student_profile sp ON sp.student_id = te.student_id
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
export async function findRefundByPublicId(publicId) {
  const result = await sql`
    SELECT
      r.*,
      te.public_id AS enrollment_public_id,
      te.fee_at_enrollment,
      tc.title AS course_title,
      tb.batch_name,
      sp.first_name,
      sp.last_name,
      sp.middle_name,
      sp.email AS student_email,
      creator.full_name AS created_by_name,
      voider.full_name AS voided_by_name
    FROM refunds r
    JOIN tesda_enrollments te ON te.enrollment_id = r.enrollment_id
    LEFT JOIN tesda_courses tc ON tc.course_id = te.course_id
    LEFT JOIN tesda_batches tb ON tb.batch_id = te.batch_id
    LEFT JOIN student_profile sp ON sp.student_id = te.student_id
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
