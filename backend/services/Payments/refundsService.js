// => Business logic and validation live here. Controllers stay thin,
// => models stay dumb.
import { pool } from '../../config/db.js';
import * as refundsModel from '../../models/Payments/refundsModel.js';

function formatStudentName({ first_name, middle_name, last_name }) {
  const middleInitial = middle_name ? `${middle_name.charAt(0)}.` : '';
  return [first_name, middleInitial, last_name].filter(Boolean).join(' ');
}

export async function getTesdaCourseOptions() {
  const rows = await refundsModel.findTesdaCourseOptions();
  return rows.map((row) => ({ courseId: row.course_id, title: row.title }));
}

export async function getRefundableEnrollments(searchTerm) {
  const [tesdaRows, shsRows] = await Promise.all([
    refundsModel.findRefundableEnrollments(searchTerm),
    refundsModel.findRefundableShsEnrollments(searchTerm),
  ]);

  const tesdaResults = tesdaRows.map((row) => {
    const courseFee = Number(row.fee_at_enrollment);
    const miscFee = Number(row.total_misc_fee || 0);

    return {
      enrollmentId: row.enrollment_id,
      enrollmentPublicId: row.public_id,
      enrollmentType: 'TESDA',
      studentName: formatStudentName(row),
      studentEmail: row.email,
      batchName: row.batch_name,
      courseFee,
      miscFee,
      // => totalDue is what percentage-based refunds are calculated
      // => against, course fee plus any misc fees on this TESDA batch
      totalDue: courseFee + miscFee,
      totalPaid: Number(row.total_paid),
      totalRefunded: Number(row.total_refunded),
      refundableBalance: Number(row.total_paid) - Number(row.total_refunded)
    };
  });

  const shsResults = shsRows.map((row) => ({
    enrollmentId: row.enrollment_id,
    enrollmentPublicId: row.public_id,
    enrollmentType: 'SHS',
    studentName: formatStudentName(row),
    studentEmail: row.email,
    batchName: row.batch_name,
    courseFee: null,
    miscFee: Number(row.total_misc_fee),
    totalDue: Number(row.total_misc_fee),
    totalPaid: Number(row.total_paid),
    totalRefunded: Number(row.total_refunded),
    refundableBalance: Number(row.total_paid) - Number(row.total_refunded)
  }));

  return [...tesdaResults, ...shsResults];
}

export async function createRefund({ enrollmentType, enrollmentId, refundType, percentageValue, amount, reason, remarks, admin }) {
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

  if (!['Percentage', 'Fixed'].includes(refundType)) {
    const err = new Error('refundType must be "Percentage" or "Fixed".');
    err.status = 400;
    throw err;
  }

  if (refundType === 'Percentage' && (!percentageValue || percentageValue <= 0 || percentageValue > 100)) {
    const err = new Error('percentageValue must be between 0 and 100 for a Percentage refund.');
    err.status = 400;
    throw err;
  }

  if (!amount || typeof amount !== 'number' || amount <= 0) {
    const err = new Error('amount is required and must be a positive number.');
    err.status = 400;
    throw err;
  }

  if (!reason || !reason.trim()) {
    const err = new Error('reason is required.');
    err.status = 400;
    throw err;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let totalDue;
    let refundableBalance;

    if (enrollmentType === 'TESDA') {
      const enrollment = await refundsModel.lockEnrollmentForRefund(client, enrollmentId);

      if (!enrollment) {
        const err = new Error('Enrollment not found.');
        err.status = 404;
        throw err;
      }
      if (enrollment.class_type !== 'Regular') {
        const err = new Error('Only Regular TESDA batch enrollments accept refunds.');
        err.status = 400;
        throw err;
      }

      // => totalDue now includes any misc fees on this TESDA batch, so
      // => percentage-based refunds calculate against the full amount owed
      totalDue = Number(enrollment.fee_at_enrollment) + Number(enrollment.total_misc_fee || 0);
      refundableBalance = Number(enrollment.total_paid) - Number(enrollment.total_refunded);
    } else {
      const enrollment = await refundsModel.lockShsEnrollmentForRefund(client, enrollmentId);

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

      totalDue = Number(enrollment.total_misc_fee);
      refundableBalance = Number(enrollment.total_paid) - Number(enrollment.total_refunded);
    }

    if (amount > refundableBalance) {
      const err = new Error(`Amount exceeds the refundable balance of ${refundableBalance.toFixed(2)}.`);
      err.status = 400;
      throw err;
    }

    // => Percentage is calculated against totalDue (course fee for
    // => TESDA, total batch misc fee for SHS) - not against amount paid.
    if (refundType === 'Percentage') {
      const expectedAmount = totalDue * (percentageValue / 100);
      if (Math.abs(expectedAmount - amount) > 0.01) {
        const err = new Error('amount does not match percentageValue applied to the total due.');
        err.status = 400;
        throw err;
      }
    }

    const refund = await refundsModel.insertRefund(client, {
      enrollmentType,
      enrollmentId,
      refundType,
      percentageValue: refundType === 'Percentage' ? percentageValue : null,
      amount,
      reason,
      remarks,
      createdBy: admin.adminId
    });

    await refundsModel.insertActivityLog(client, {
      entityType: 'refund',
      entityId: refund.refund_id,
      actorId: admin.adminId,
      actorName: admin.fullName,
      action: 'refund_created',
      actionDetail: `Recorded ${enrollmentType} refund ${refund.refund_number} for enrollment #${enrollmentId}, amount ${amount}.`
    });

    await client.query('COMMIT');

    return refund;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listRefunds({ page = 1, limit = 10, status, courseId, search }) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10));
  const safeCourseId = courseId ? Number(courseId) : null;

  const { rows, total } = await refundsModel.listRefunds({
    page: safePage,
    limit: safeLimit,
    status: status || null,
    courseId: safeCourseId,
    search: search || null
  });

  return {
    refunds: rows.map((row) => ({
      refundId: row.refund_id,
      publicId: row.public_id,
      refundNumber: row.refund_number,
      amount: Number(row.amount),
      refundType: row.refund_type,
      status: row.status,
      createdAt: row.created_at,
      enrollmentType: row.enrollment_type,
      studentName: formatStudentName(row),
      batchName: row.batch_name,
      batchSequence: row.batch_sequence
    })),
    totalCount: total,
    page: safePage,
    totalPages: Math.max(1, Math.ceil(total / safeLimit))
  };
}

export async function getRefundDetail(publicId) {
  const row = await refundsModel.findRefundByPublicId(publicId);

  if (!row) {
    const err = new Error('Refund not found.');
    err.status = 404;
    throw err;
  }

  // => Same pick-the-right-side logic as paymentsService.js's getPaymentDetail
  const isTesda = row.enrollment_type === 'TESDA';

  const courseFee = isTesda ? Number(row.fee_at_enrollment || 0) : null;
  const miscFee = isTesda ? Number(row.tesda_total_misc_fee || 0) : Number(row.shs_total_misc_fee || 0);
  const totalDue = (courseFee || 0) + miscFee;

  return {
    refundId: row.refund_id,
    publicId: row.public_id,
    refundNumber: row.refund_number,
    amount: Number(row.amount),
    refundType: row.refund_type,
    percentageValue: row.percentage_value ? Number(row.percentage_value) : null,
    refundMethod: row.refund_method,
    reason: row.reason,
    remarks: row.remarks,
    status: row.status,
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

export async function voidRefund({ publicId, voidReason, admin }) {
  if (!voidReason || typeof voidReason !== 'string' || voidReason.trim().length < 3) {
    const err = new Error('voidReason is required and must describe the reason.');
    err.status = 400;
    throw err;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existing = await refundsModel.findRefundIdByPublicId(client, publicId);

    if (!existing) {
      const err = new Error('Refund not found.');
      err.status = 404;
      throw err;
    }

    if (existing.status === 'Voided') {
      const err = new Error('Refund is already voided.');
      err.status = 400;
      throw err;
    }

    const voided = await refundsModel.voidRefundRow(client, {
      refundId: existing.refund_id,
      voidReason,
      voidedBy: admin.adminId
    });

    await refundsModel.insertActivityLog(client, {
      entityType: 'refund',
      entityId: existing.refund_id,
      actorId: admin.adminId,
      actorName: admin.fullName,
      action: 'refund_voided',
      actionDetail: `Voided refund ${voided.refund_number}. Reason: ${voidReason}`
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
