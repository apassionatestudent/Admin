// => Business logic and validation live here. Controllers stay thin,
// => models stay dumb. Basic input-shape checks live here too, not in
// => middleware - frontend catches the obvious stuff first, services own
// => the authoritative checks.
import { pool } from '../../config/db.js';
import * as paymentsModel from '../../models/Payments/paymentsModel.js';

function formatStudentName({ first_name, middle_name, last_name }) {
  const middleInitial = middle_name ? `${middle_name.charAt(0)}.` : '';
  return [first_name, middleInitial, last_name].filter(Boolean).join(' ');
}

export async function getTesdaCourseOptions() {
  const rows = await paymentsModel.findTesdaCourseOptions();

  return rows.map((row) => ({
    courseId: row.course_id,
    title: row.title
  }));
}

export async function getEligibleEnrollments(searchTerm) {
  const rows = await paymentsModel.findEligibleEnrollments(searchTerm);

  return rows.map((row) => ({
    enrollmentId: row.enrollment_id,
    enrollmentPublicId: row.public_id,
    studentName: formatStudentName(row),
    courseTitle: row.course_title,
    batchName: row.batch_name,
    feeAtEnrollment: Number(row.fee_at_enrollment),
    totalPaid: Number(row.total_paid),
    balance: Number(row.fee_at_enrollment) - Number(row.total_paid)
  }));
}

export async function createPayment({ enrollmentId, amount, paymentDate, remarks, admin }) {
  // => Basic input guards live here now instead of middleware - services
  // => own the full validation + business logic layer, not just
  // => cross-entity rules
  if (!enrollmentId || typeof enrollmentId !== 'number') {
    const err = new Error('enrollmentId is required and must be a number.');
    err.status = 400;
    throw err;
  }

  if (!amount || typeof amount !== 'number' || amount <= 0) {
    const err = new Error('amount is required and must be a positive number.');
    err.status = 400;
    throw err;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const enrollment = await paymentsModel.lockEnrollmentBalance(client, enrollmentId);

    if (!enrollment) {
      const err = new Error('Enrollment not found.');
      err.status = 404;
      throw err;
    }

    if (enrollment.class_type !== 'Regular') {
      const err = new Error('Only Regular TESDA batch enrollments accept OTC payments.');
      err.status = 400;
      throw err;
    }

    if (enrollment.is_tesda_scholar) {
      const err = new Error('This enrollment is TESDA-sponsored and does not accept OTC payments.');
      err.status = 400;
      throw err;
    }

    const remainingBalance = Number(enrollment.fee_at_enrollment) - Number(enrollment.total_paid);

    if (amount > remainingBalance) {
      const err = new Error(`Amount exceeds the remaining balance of ${remainingBalance.toFixed(2)}.`);
      err.status = 400;
      throw err;
    }

    const payment = await paymentsModel.insertPayment(client, {
      enrollmentId,
      amount,
      paymentDate,
      remarks,
      createdBy: admin.adminId
    });

    await paymentsModel.insertActivityLog(client, {
      entityType: 'payment',
      entityId: payment.payment_id,
      actorId: admin.adminId,
      actorName: admin.fullName,
      action: 'payment_created',
      actionDetail: `Recorded payment ${payment.or_number} for enrollment #${enrollmentId}, amount ${amount}.`
    });

    await client.query('COMMIT');

    return payment;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listPayments({ page = 1, limit = 10, status, courseId, search }) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10));
  // => courseId arrives from query params as a string, or undefined if
  // => the "All Courses" option is selected
  const safeCourseId = courseId ? Number(courseId) : null;

  const { rows, total } = await paymentsModel.listPayments({
    page: safePage,
    limit: safeLimit,
    status: status || null,
    courseId: safeCourseId,
    search: search || null
  });

  return {
    payments: rows.map((row) => ({
      paymentId: row.payment_id,
      publicId: row.public_id,
      orNumber: row.or_number,
      amount: Number(row.amount),
      paymentDate: row.payment_date,
      status: row.status,
      createdAt: row.created_at,
      studentName: formatStudentName(row),
      courseTitle: row.course_title
    })),
    totalCount: total,
    page: safePage,
    totalPages: Math.max(1, Math.ceil(total / safeLimit))
  };
}

export async function getPaymentDetail(publicId) {
  const row = await paymentsModel.findPaymentByPublicId(publicId);

  if (!row) {
    const err = new Error('Payment not found.');
    err.status = 404;
    throw err;
  }

  return {
    paymentId: row.payment_id,
    publicId: row.public_id,
    orNumber: row.or_number,
    amount: Number(row.amount),
    paymentDate: row.payment_date,
    paymentMethod: row.payment_method,
    status: row.status,
    remarks: row.remarks,
    voidReason: row.void_reason,
    voidedByName: row.voided_by_name,
    voidedAt: row.voided_at,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    enrollmentPublicId: row.enrollment_public_id,
    feeAtEnrollment: Number(row.fee_at_enrollment),
    studentName: formatStudentName(row),
    studentEmail: row.student_email,
    courseTitle: row.course_title,
    batchName: row.batch_name
  };
}

export async function voidPayment({ publicId, voidReason, admin }) {
  // => Basic input guard lives here now instead of middleware
  if (!voidReason || typeof voidReason !== 'string' || voidReason.trim().length < 3) {
    const err = new Error('voidReason is required and must describe the reason.');
    err.status = 400;
    throw err;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existing = await paymentsModel.findPaymentIdByPublicId(client, publicId);

    if (!existing) {
      const err = new Error('Payment not found.');
      err.status = 404;
      throw err;
    }

    if (existing.status === 'Voided') {
      const err = new Error('Payment is already voided.');
      err.status = 400;
      throw err;
    }

    const voided = await paymentsModel.voidPaymentRow(client, {
      paymentId: existing.payment_id,
      voidReason,
      voidedBy: admin.adminId
    });

    await paymentsModel.insertActivityLog(client, {
      entityType: 'payment',
      entityId: existing.payment_id,
      actorId: admin.adminId,
      actorName: admin.fullName,
      action: 'payment_voided',
      actionDetail: `Voided payment ${voided.or_number}. Reason: ${voidReason}`
    });

    await client.query('COMMIT');

    return voided;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
