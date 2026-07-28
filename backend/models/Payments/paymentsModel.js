// => Raw SQL only, no business logic here. pool is used for the two
// => multi-step transactions (create, void); sql is used for the
// => read-only single queries.
import { pool, sql } from '../../config/db.js';

// => Active TESDA courses for the Payments page's Course filter dropdown.
// => Kept simple and independent of enrollment/payment data - a course
// => should be selectable even if it has zero payments yet.
export async function findTesdaCourseOptions() {
  const result = await sql`
    SELECT course_id, title
    FROM tesda_courses
    WHERE status = 'active'
    ORDER BY title ASC
  `;

  return result.rows;
}

// => Enrollments eligible for a new OTC payment: TESDA Regular batches
// => only, non-scholars only, and still carrying a remaining balance.
// => search matches student name or course title.
export async function findEligibleEnrollments(searchTerm) {
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
      COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'Completed'), 0) AS total_paid
    FROM tesda_enrollments te
    JOIN tesda_batches tb ON tb.batch_id = te.batch_id
    LEFT JOIN tesda_courses tc ON tc.course_id = te.course_id
    LEFT JOIN student_profile sp ON sp.student_id = te.student_id
    LEFT JOIN payments p ON p.enrollment_id = te.enrollment_id
    WHERE tb.class_type = 'Regular'
      AND te.is_tesda_scholar = FALSE
      -- => only Approved enrollments should be payable, adjust this
      -- => if you want Pending enrollments to accept payment too
      AND te.status = 'Approved'
      AND (
        sp.first_name ILIKE ${term}
        OR sp.last_name ILIKE ${term}
        OR tc.title ILIKE ${term}
      )
    GROUP BY te.enrollment_id, tb.batch_name, tc.title, sp.first_name, sp.last_name, sp.middle_name
    -- => hide enrollments already fully paid
    HAVING COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'Completed'), 0) < te.fee_at_enrollment
    ORDER BY sp.last_name ASC
    LIMIT 20
  `;

  return result.rows;
}

// => Locks the enrollment row for the duration of the transaction so two
// => admins recording a payment at the same time can't both push the
// => balance negative. Must be called inside a pool client transaction.
export async function lockEnrollmentBalance(client, enrollmentId) {
  // => Step 1: lock just the enrollment row. Postgres rejects FOR UPDATE
  // => combined with GROUP BY/aggregates, so the lock and the aggregate
  // => read below are two separate queries instead of one.
  const lockResult = await client.query(
    `SELECT te.enrollment_id,
            te.fee_at_enrollment,
            te.is_tesda_scholar,
            tb.class_type
     FROM tesda_enrollments te
     JOIN tesda_batches tb ON tb.batch_id = te.batch_id
     WHERE te.enrollment_id = $1
     FOR UPDATE OF te`,
    [enrollmentId]
  );

  const enrollment = lockResult.rows[0];
  if (!enrollment) return null;

  // => Step 2: read-only aggregate for total paid
  const aggResult = await client.query(
    `SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'Completed'), 0) AS total_paid
     FROM payments
     WHERE enrollment_id = $1`,
    [enrollmentId]
  );

  return {
    enrollment_id: enrollment.enrollment_id,
    fee_at_enrollment: enrollment.fee_at_enrollment,
    is_tesda_scholar: enrollment.is_tesda_scholar,
    class_type: enrollment.class_type,
    total_paid: aggResult.rows[0].total_paid
  };
}

export async function insertPayment(client, { enrollmentId, amount, paymentDate, remarks, createdBy }) {
  const result = await client.query(
    `INSERT INTO payments (enrollment_id, amount, payment_date, remarks, created_by)
     VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4, $5)
     RETURNING *`,
    [enrollmentId, amount, paymentDate || null, remarks || null, createdBy]
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

// => Paginated list, 10 per page by default. status filter is optional
// => ('Completed' | 'Voided'); courseId filters to one TESDA course;
// => search matches OR number or student name.
export async function listPayments({ page, limit, status, courseId, search }) {
  const offset = (page - 1) * limit;
  const term = `%${search || ''}%`;

  const rows = await sql`
    SELECT
      p.payment_id,
      p.public_id,
      p.or_number,
      p.amount,
      p.payment_date,
      p.status,
      p.created_at,
      tc.title AS course_title,
      sp.first_name,
      sp.last_name,
      sp.middle_name
    FROM payments p
    JOIN tesda_enrollments te ON te.enrollment_id = p.enrollment_id
    LEFT JOIN tesda_courses tc ON tc.course_id = te.course_id
    LEFT JOIN student_profile sp ON sp.student_id = te.student_id
    WHERE (${status}::text IS NULL OR p.status = ${status})
      AND (${courseId}::int IS NULL OR te.course_id = ${courseId})
      AND (
        ${search}::text IS NULL
        OR p.or_number ILIKE ${term}
        OR sp.first_name ILIKE ${term}
        OR sp.last_name ILIKE ${term}
      )
    ORDER BY p.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countResult = await sql`
    SELECT COUNT(*)::int AS total
    FROM payments p
    JOIN tesda_enrollments te ON te.enrollment_id = p.enrollment_id
    LEFT JOIN student_profile sp ON sp.student_id = te.student_id
    WHERE (${status}::text IS NULL OR p.status = ${status})
      AND (${courseId}::int IS NULL OR te.course_id = ${courseId})
      AND (
        ${search}::text IS NULL
        OR p.or_number ILIKE ${term}
        OR sp.first_name ILIKE ${term}
        OR sp.last_name ILIKE ${term}
      )
  `;

  return { rows: rows.rows, total: countResult.rows[0].total };
}

// => Full detail row, used by both the PaymentDetail view and the PDF
// => receipt generator. Pulls in the acting admin names for the audit trail.
export async function findPaymentByPublicId(publicId) {
  const result = await sql`
    SELECT
      p.*,
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
    FROM payments p
    JOIN tesda_enrollments te ON te.enrollment_id = p.enrollment_id
    LEFT JOIN tesda_courses tc ON tc.course_id = te.course_id
    LEFT JOIN tesda_batches tb ON tb.batch_id = te.batch_id
    LEFT JOIN student_profile sp ON sp.student_id = te.student_id
    LEFT JOIN admins creator ON creator.admin_id = p.created_by
    LEFT JOIN admins voider ON voider.admin_id = p.voided_by
    WHERE p.public_id = ${publicId}
  `;

  return result.rows[0] || null;
}

// => Only used internally to fetch the payment_id + enrollment_id pair
// => before voiding, so the void transaction can lock the right row.
export async function findPaymentIdByPublicId(client, publicId) {
  const result = await client.query(
    `SELECT payment_id, enrollment_id, status FROM payments WHERE public_id = $1 FOR UPDATE`,
    [publicId]
  );

  return result.rows[0] || null;
}

export async function voidPaymentRow(client, { paymentId, voidReason, voidedBy }) {
  const result = await client.query(
    `UPDATE payments
     SET status = 'Voided', void_reason = $1, voided_by = $2, voided_at = NOW()
     WHERE payment_id = $3
     RETURNING *`,
    [voidReason, voidedBy, paymentId]
  );

  return result.rows[0];
}
