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
      COALESCE(tesda_fee.total_misc_fee, 0) AS total_misc_fee,
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
    -- => TESDA batches can carry batch_misc_fees rows too now, same
    -- => LATERAL pattern already used for SHS below
    LEFT JOIN LATERAL (
      SELECT SUM(fee_amount) AS total_misc_fee
      FROM batch_misc_fees
      WHERE batch_type = 'TESDA' AND batch_id = tb.batch_id
    ) tesda_fee ON true
    WHERE tb.class_type = 'Regular'
      AND te.is_tesda_scholar = FALSE
      -- => Payment must be collectible BEFORE approval now, since the
      -- => reservation fee gates approval - Rejected/Dropped are the only
      -- => terminal states that should stop accepting payment.
      AND te.status NOT IN ('Rejected', 'Dropped')
      AND (
        sp.first_name ILIKE ${term}
        OR sp.last_name ILIKE ${term}
        OR tc.title ILIKE ${term}
      )
    GROUP BY te.enrollment_id, tb.batch_name, tc.title, sp.first_name, sp.last_name, sp.middle_name, tesda_fee.total_misc_fee
    -- => hide enrollments already fully paid - total owed is course fee
    -- => plus any misc fees configured on this TESDA batch
    HAVING COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'Completed'), 0) < (te.fee_at_enrollment + COALESCE(tesda_fee.total_misc_fee, 0))
    ORDER BY sp.last_name ASC
    LIMIT 20
  `;

  return result.rows;
}

// => Enrollments eligible for a new SHS miscellaneous-fee payment: must
// => have a batch assigned, that batch must actually have at least one
// => misc fee configured, and the student must still owe something.
// => search matches student name or cluster name.
export async function findEligibleShsEnrollments(searchTerm) {
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
      COALESCE(fee_totals.total_misc_fee, 0) AS total_misc_fee,
      COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'Completed'), 0) AS total_paid
    FROM shs_enrollments se
    JOIN shs_batches sb ON sb.batch_id = se.batch_id
    LEFT JOIN shs_clusters sc ON sc.cluster_id = se.cluster_id
    LEFT JOIN student_profile sp ON sp.student_id = se.student_id
    LEFT JOIN payments p ON p.enrollment_type = 'SHS' AND p.enrollment_id = se.enrollment_id
    LEFT JOIN LATERAL (
      SELECT SUM(fee_amount) AS total_misc_fee
      FROM batch_misc_fees
      WHERE batch_type = 'SHS' AND batch_id = se.batch_id
    ) fee_totals ON true
    WHERE se.status NOT IN ('Rejected', 'Dropped')
      AND se.batch_id IS NOT NULL
      AND (
        sp.first_name ILIKE ${term}
        OR sp.last_name ILIKE ${term}
        OR sc.name ILIKE ${term}
      )
    GROUP BY se.enrollment_id, sb.batch_name, sc.name, sp.first_name, sp.last_name, sp.middle_name, fee_totals.total_misc_fee
    -- => hide batches with no misc fee configured at all, and enrollments already fully paid
    HAVING COALESCE(fee_totals.total_misc_fee, 0) > 0
       AND COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'Completed'), 0) < COALESCE(fee_totals.total_misc_fee, 0)
    ORDER BY sp.last_name ASC
    LIMIT 20
  `;

  return result.rows;
}

// => SHS counterpart to lockEnrollmentBalance. No class_type/scholar
// => checks here - those are TESDA-only concepts. Returns total_misc_fee
// => = 0 if the batch has no fees configured, which the service layer
// => treats as "nothing payable."
export async function lockShsEnrollmentBalance(client, enrollmentId) {
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
    return { enrollment_id: enrollment.enrollment_id, batch_id: null, total_misc_fee: 0, total_paid: 0 };
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

  return {
    enrollment_id: enrollment.enrollment_id,
    batch_id: enrollment.batch_id,
    total_misc_fee: feeResult.rows[0].total_misc_fee,
    total_paid: paidResult.rows[0].total_paid,
  };
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
            tb.batch_id,
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

  // => Misc fees configured on this TESDA batch, same table/shape SHS
  // => already reads via lockShsEnrollmentBalance above
  const feeResult = await client.query(
    `SELECT COALESCE(SUM(fee_amount), 0) AS total_misc_fee
     FROM batch_misc_fees
     WHERE batch_type = 'TESDA' AND batch_id = $1`,
    [enrollment.batch_id]
  );

  return {
    enrollment_id: enrollment.enrollment_id,
    fee_at_enrollment: enrollment.fee_at_enrollment,
    total_misc_fee: feeResult.rows[0].total_misc_fee,
    is_tesda_scholar: enrollment.is_tesda_scholar,
    class_type: enrollment.class_type,
    total_paid: aggResult.rows[0].total_paid
  };
}

export async function insertPayment(client, { enrollmentType, enrollmentId, amount, paymentDate, remarks, createdBy }) {
  const result = await client.query(
    `INSERT INTO payments (enrollment_type, enrollment_id, amount, payment_date, remarks, created_by)
     VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5, $6)
     RETURNING *`,
    [enrollmentType, enrollmentId, amount, paymentDate || null, remarks || null, createdBy]
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

// => Paginated list, 10 per page by default. status filter is optional
// => ('Completed' | 'Voided'); courseId filters to one TESDA course
// => (course filtering stays TESDA-only by design - SHS has no single
// => course concept per enrollment); search matches OR number or student
// => name. Same dual-LEFT-JOIN pattern as findPaymentByPublicId above -
// => this is still one row per payment (not a UNION), so no duplication
// => risk, just correctness for whichever side actually applies.
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
      p.enrollment_type,
      sp.first_name,
      sp.last_name,
      sp.middle_name,
      COALESCE(tb.batch_name, sb.batch_name) AS batch_name,
      COALESCE(tb.batch_sequence, sb.batch_sequence) AS batch_sequence
    FROM payments p
    LEFT JOIN tesda_enrollments te ON te.enrollment_id = p.enrollment_id AND p.enrollment_type = 'TESDA'
    LEFT JOIN tesda_batches tb ON tb.batch_id = te.batch_id
    LEFT JOIN shs_enrollments se ON se.enrollment_id = p.enrollment_id AND p.enrollment_type = 'SHS'
    LEFT JOIN shs_batches sb ON sb.batch_id = se.batch_id
    LEFT JOIN student_profile sp ON sp.student_id = COALESCE(te.student_id, se.student_id)
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
    LEFT JOIN tesda_enrollments te ON te.enrollment_id = p.enrollment_id AND p.enrollment_type = 'TESDA'
    LEFT JOIN shs_enrollments se ON se.enrollment_id = p.enrollment_id AND p.enrollment_type = 'SHS'
    LEFT JOIN student_profile sp ON sp.student_id = COALESCE(te.student_id, se.student_id)
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
// => LEFT JOINs BOTH tesda_enrollments and shs_enrollments, each gated by
// => p.enrollment_type IN THE JOIN CONDITION ITSELF - enrollment_id has no
// => DB-level FK across the two tables (separate SERIAL sequences), so an
// => unconditional single-table join can silently match an unrelated
// => enrollment whenever the numeric IDs happen to coincide. Gating the
// => join condition means only the side matching this payment's actual
// => enrollment_type ever produces a real row; the other side is
// => guaranteed NULL, so there's no risk of a duplicate/Cartesian row.
export async function findPaymentByPublicId(publicId) {
  const result = await sql`
    SELECT
      p.*,
      COALESCE(te.public_id, se.public_id) AS enrollment_public_id,
      sp.first_name,
      sp.last_name,
      sp.middle_name,
      sp.email AS student_email,
      creator.full_name AS created_by_name,
      voider.full_name AS voided_by_name,
      -- => TESDA-side fields, NULL when this payment is SHS. Misc fees
      -- => summed via LATERAL the same way SHS's are below, since TESDA
      -- => batches can now carry batch_misc_fees rows too.
      te.fee_at_enrollment,
      tesda_fee.total_misc_fee AS tesda_total_misc_fee,
      tb.batch_name AS tesda_batch_name,
      tb.batch_sequence AS tesda_batch_sequence,
      -- => SHS-side fields, NULL when this payment is TESDA. SHS has no
      -- => single "fee" column on the enrollment - the batch's configured
      -- => misc fees are the only amount owed, summed via LATERAL.
      sb.batch_name AS shs_batch_name,
      sb.batch_sequence AS shs_batch_sequence,
      shs_fee.total_misc_fee AS shs_total_misc_fee
    FROM payments p
    LEFT JOIN tesda_enrollments te ON te.enrollment_id = p.enrollment_id AND p.enrollment_type = 'TESDA'
    LEFT JOIN tesda_batches tb ON tb.batch_id = te.batch_id
    LEFT JOIN LATERAL (
      SELECT SUM(fee_amount) AS total_misc_fee
      FROM batch_misc_fees
      WHERE batch_type = 'TESDA' AND batch_id = tb.batch_id
    ) tesda_fee ON p.enrollment_type = 'TESDA'
    LEFT JOIN shs_enrollments se ON se.enrollment_id = p.enrollment_id AND p.enrollment_type = 'SHS'
    LEFT JOIN shs_batches sb ON sb.batch_id = se.batch_id
    LEFT JOIN LATERAL (
      SELECT SUM(fee_amount) AS total_misc_fee
      FROM batch_misc_fees
      WHERE batch_type = 'SHS' AND batch_id = sb.batch_id
    ) shs_fee ON p.enrollment_type = 'SHS'
    LEFT JOIN student_profile sp ON sp.student_id = COALESCE(te.student_id, se.student_id)
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

// => Payment rows for a single enrollment's Payment History section
// => (tesdaEnrollmentDetail / shsEnrollmentDetail / StudentDetail). Takes
// => enrollmentType explicitly since payments.enrollment_id has no DB-level
// => FK across two tables - the type filter is what keeps a TESDA lookup
// => from ever matching an SHS row that happens to share the same id.
export async function findPaymentsForEnrollment(enrollmentType, enrollmentId) {
  const result = await sql`
    SELECT public_id, or_number, amount, payment_date, status
    FROM payments
    WHERE enrollment_type = ${enrollmentType} AND enrollment_id = ${enrollmentId}
    ORDER BY payment_date DESC
  `;

  return result.rows;
}

// => Payment rows across BOTH TESDA and SHS enrollments for one student,
// => for StudentDetail's Payment & Refund History section. Joins through
// => both enrollment tables since payments.enrollment_id has no
// => single-table FK (see enrollment_type migration notes).
export async function findPaymentsForStudent(studentId) {
  const result = await sql`
    SELECT p.public_id, p.or_number, p.amount, p.payment_date, p.status,
           'TESDA' AS program_type
    FROM payments p
    JOIN tesda_enrollments te ON te.enrollment_id = p.enrollment_id
    WHERE p.enrollment_type = 'TESDA' AND te.student_id = ${studentId}

    UNION ALL

    SELECT p.public_id, p.or_number, p.amount, p.payment_date, p.status,
           'SHS' AS program_type
    FROM payments p
    JOIN shs_enrollments se ON se.enrollment_id = p.enrollment_id
    WHERE p.enrollment_type = 'SHS' AND se.student_id = ${studentId}
  `;

  return result.rows;
}
