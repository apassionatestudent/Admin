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
  const [tesdaRows, shsRows] = await Promise.all([
    paymentsModel.findEligibleEnrollments(searchTerm),
    paymentsModel.findEligibleShsEnrollments(searchTerm),
  ]);

  const tesdaResults = tesdaRows.map((row) => {
    const courseFee = Number(row.fee_at_enrollment);
    const miscFee = Number(row.total_misc_fee || 0);
    const totalDue = courseFee + miscFee;

    return {
      enrollmentId: row.enrollment_id,
      enrollmentPublicId: row.public_id,
      enrollmentType: 'TESDA',
      studentName: formatStudentName(row),
      courseTitle: row.course_title,
      batchName: row.batch_name,
      // => courseFee and miscFee are now tracked separately, totalDue
      // => stays as the combined figure so existing balance math keeps working
      courseFee,
      miscFee,
      totalDue,
      totalPaid: Number(row.total_paid),
      balance: totalDue - Number(row.total_paid)
    };
  });

  const shsResults = shsRows.map((row) => ({
    enrollmentId: row.enrollment_id,
    enrollmentPublicId: row.public_id,
    enrollmentType: 'SHS',
    studentName: formatStudentName(row),
    courseTitle: row.cluster_name,
    batchName: row.batch_name,
    // => SHS never has a separate course fee, courseFee stays null so
    // => the frontend can distinguish the two program types on this field alone
    courseFee: null,
    miscFee: Number(row.total_misc_fee),
    totalDue: Number(row.total_misc_fee),
    totalPaid: Number(row.total_paid),
    balance: Number(row.total_misc_fee) - Number(row.total_paid)
  }));

  return [...tesdaResults, ...shsResults];
}

export async function createPayment({ enrollmentType, enrollmentId, amount, paymentDate, remarks, admin }) {
  // => Basic input guards live here now instead of middleware - services
  // => own the full validation + business logic layer, not just
  // => cross-entity rules
  if (!enrollmentType || !['TESDA', 'SHS'].includes(enrollmentType)) {
    const err = new Error('enrollmentType must be "TESDA" or "SHS".');
    err.status = 400;
    throw err;
  }

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

    let remainingBalance;

    if (enrollmentType === 'TESDA') {
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

      // => Remaining balance now includes any misc fees configured on
      // => this TESDA batch, not just the course fee
      remainingBalance = (Number(enrollment.fee_at_enrollment) + Number(enrollment.total_misc_fee || 0)) - Number(enrollment.total_paid);
    } else {
      const enrollment = await paymentsModel.lockShsEnrollmentBalance(client, enrollmentId);

      if (!enrollment) {
        const err = new Error('Enrollment not found.');
        err.status = 404;
        throw err;
      }
      if (!enrollment.batch_id) {
        const err = new Error('This enrollment has no batch assigned yet.');
        err.status = 400;
        throw err;
      }
      if (Number(enrollment.total_misc_fee) <= 0) {
        const err = new Error('This batch has no miscellaneous fee assigned.');
        err.status = 400;
        throw err;
      }

      remainingBalance = Number(enrollment.total_misc_fee) - Number(enrollment.total_paid);
    }

    if (amount > remainingBalance) {
      const err = new Error(`Amount exceeds the remaining balance of ${remainingBalance.toFixed(2)}.`);
      err.status = 400;
      throw err;
    }

    const payment = await paymentsModel.insertPayment(client, {
      enrollmentType,
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
      actionDetail: `Recorded ${enrollmentType} payment ${payment.or_number} for enrollment #${enrollmentId}, amount ${amount}.`
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
      enrollmentType: row.enrollment_type,
      studentName: formatStudentName(row),
      // => Batch replaces course title as the display column - a batch
      // => already implies its course for TESDA, and SHS enrollments
      // => have no single "course" concept per the cluster-based model
      batchName: row.batch_name,
      batchSequence: row.batch_sequence
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

  // => Picks the right side's batch/fee data based on enrollment_type -
  // => the other side is always NULL by construction of the model query
  const isTesda = row.enrollment_type === 'TESDA';

  // => courseFee is TESDA-only (null for SHS), miscFee applies to both
  // => program types now that TESDA batches can carry batch_misc_fees too
  const courseFee = isTesda ? Number(row.fee_at_enrollment || 0) : null;
  const miscFee = isTesda ? Number(row.tesda_total_misc_fee || 0) : Number(row.shs_total_misc_fee || 0);
  const totalDue = (courseFee || 0) + miscFee;

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
    enrollmentType: row.enrollment_type,
    courseFee,
    miscFee,
    totalDue,
    studentName: formatStudentName(row),
    studentEmail: row.student_email,
    batchName: isTesda ? row.tesda_batch_name : row.shs_batch_name,
    batchSequence: isTesda ? row.tesda_batch_sequence : row.shs_batch_sequence
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
