// => admin/services/Enrollments/shsEnrollmentService.js
// => Split out of the old adminEnrollmentService.js - SHS-only logic.
//    Shared profile/address model functions and ALLOWED_STATUSES are
//    imported from the shared files below.

import { pool } from '../../config/db.js';

import {
  getProfileByStudentId,
  getAddressByStudentId,
  updateProfile,
  updateAddress,
  getAdminNameById,
} from '../../models/Enrollments/sharedEnrollmentModel.js';

// => Same activity-log helper Batches already uses
import { logActivity, getActivityLogsForEntity } from '../../models/adminActivityLogModel.js';

import {
  getShsEnrollmentDetailByPublicId,
  getShsDocsByEnrollmentId,
  getFamilyMembersByStudentId,
  getClusterCourses,
  updateShsEnrollmentStatus,
  approveShsEnrollmentWithLock,
  updateShsEnrollmentFields,
  replaceFamilyMembers,
  addShsDocument,
  replaceShsDocument,
  deleteShsDocument,
  getAvailableShsClasses,
  getShsTracksAndClusters,
} from '../../models/Enrollments/shsEnrollmentModel.js';

import { ALLOWED_STATUSES } from './sharedEnrollmentService.js';

// => Enrollment status email notification - shared util handles both
// => TESDA and SHS, tailored content per status lives inside it
import { sendEnrollmentStatusEmail } from '../../utils/sendEnrollmentStatusEmail.js';

// => Payment History section pulls from Payments and Refunds - same
//    merge-in-the-service pattern as tesdaEnrollmentService.js. Also
//    reuses the batch misc-fee model to compute what this enrollment's
//    batch actually charges, so the empty-state text can distinguish
//    "no fee assigned yet" from "fee assigned, nothing paid yet."
import * as paymentsModel from '../../models/Payments/paymentsModel.js';
import * as refundsModel from '../../models/Payments/refundsModel.js';
import { getMiscFeesByBatch } from '../../models/Classes/adminBatchModel.js';

//
// SHS DETAIL: enrollment + shared profile/address + SHS-only docs and
//   family members (keyed by student_id, not enrollment_id)
//
export const fetchShsEnrollmentDetail = async (publicId) => {
  const enrollment = await getShsEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;

  const [profile, address, docs, familyMembers, clusterCourses, rawLogs] = await Promise.all([
    getProfileByStudentId(pool, enrollment.student_id),
    getAddressByStudentId(pool, enrollment.student_id),
    getShsDocsByEnrollmentId(pool, enrollment.enrollment_id),
    getFamilyMembersByStudentId(pool, enrollment.student_id),
    // => Read-only G11/G12 curriculum for whatever cluster the student
    //    submitted with - cluster itself is locked from editing, so this
    //    always reflects their actual submission, never something reassigned
    getClusterCourses(pool, enrollment.cluster_id),
    getActivityLogsForEntity(pool, 'shs_enrollment', enrollment.enrollment_id),
  ]);

  // => Same mapping as tesdaEnrollmentService.js - reshapes activity_logs
  //    rows into the shape shsEnrollmentDetail.jsx's Audit Log section
  //    already expects
  const logs = rawLogs.map(row => ({
    log_id: row.log_id,
    action: row.action,
    performed_by_name: row.actor_name,
    created_at: row.created_at,
    remarks: row.action_detail,
  }));

  return {
    enrollment,
    profile,
    address,
    docs,
    familyMembers,
    clusterCourses,
    logs,
  };
};

//
// STATUS UPDATE
//
export const changeShsEnrollmentStatus = async (publicId, newStatus, externalRemarks, adminId) => {
  if (!ALLOWED_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }

  // => Same reasoning as TESDA - Needs Clarification is shown to the
  //    student on their dashboard, so a note is required
  if (newStatus === 'Needs Clarification' && !externalRemarks?.trim()) {
    throw new Error('External remarks are required when setting status to "Needs Clarification".');
  }

  // => Fetched unconditionally now - needed for every status change for
  //    the activity log entry below, not just the gated statuses
  const enrollment = await getShsEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;

  // => Reserved is for enrollments that do NOT yet have a batch - same
  //    reasoning as TESDA
  if (newStatus === 'Reserved' && enrollment.batch_id) {
    throw new Error('Cannot set status to Reserved: a batch is already assigned to this enrollment.');
  }

  // => Approval requires the enrollment to currently be in Reviewed
  //    status - same sequencing rule as TESDA. No reservation fee gate
  //    here since SHS enrollment has no such fee (DepEd-covered).
  if (newStatus === 'Approved' && enrollment.status !== 'Reviewed' && enrollment.status !== 'Approved') {
    throw new Error(
      `Cannot approve: enrollment must be in "Reviewed" status first. Current status: "${enrollment.status}".`
    );
  }

  // => Approval is now capacity-gated against the batch's Approved count,
  //    so a batch must actually be assigned before Approved is reachable
  if (newStatus === 'Approved' && !enrollment.batch_id) {
    throw new Error('Cannot approve: no batch is assigned to this enrollment.');
  }

  // => For Assessment requires the enrollment to already be Approved
  if (newStatus === 'For Assessment' && enrollment.status !== 'Approved' && enrollment.status !== 'For Assessment') {
    throw new Error(
      `Cannot set status to "For Assessment": enrollment must be Approved first. Current status: "${enrollment.status}".`
    );
  }

  // => For Assessment also requires a batch to still be assigned - same
  //    reasoning as TESDA, guards against a batch being removed after
  //    Approval, which would otherwise let the misc-fee balance check
  //    below trivially pass at ₱0
  if (newStatus === 'For Assessment' && !enrollment.batch_id) {
    throw new Error('Cannot set status to "For Assessment": no batch is assigned to this enrollment.');
  }

  // => For Assessment also requires the batch's training period to have
  //    actually ended - same rule as TESDA
  if (newStatus === 'For Assessment') {
    if (!enrollment.end_date) {
      throw new Error('Cannot set status to "For Assessment": this batch has no end date set, so the training period cannot be confirmed as finished.');
    }
    const batchEndDate = new Date(enrollment.end_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    batchEndDate.setHours(0, 0, 0, 0);
    if (today < batchEndDate) {
      throw new Error(
        `Cannot set status to "For Assessment": the batch's training period has not ended yet (ends ${enrollment.end_date}).`
      );
    }
  }

  if (newStatus === 'For Assessment') {
    const payments = await paymentsModel.findPaymentsForEnrollment('SHS', enrollment.enrollment_id);
    const { totalPaid, totalRequired } = await computeShsBalance(enrollment, payments);

    if (totalPaid < totalRequired) {
      throw new Error(
        `Cannot set status to "For Assessment": balance not fully cleared. Paid ₱${totalPaid.toFixed(2)} of ₱${totalRequired.toFixed(2)} required.`
      );
    }
  }

  // => Failed Assessment requires the enrollment to already be For
  //    Assessment - same sequencing rule as TESDA
  if (newStatus === 'Failed Assessment' && enrollment.status !== 'For Assessment' && enrollment.status !== 'Failed Assessment') {
    throw new Error(
      `Cannot set status to "Failed Assessment": enrollment must be in "For Assessment" status first. Current status: "${enrollment.status}".`
    );
  }

  // => Approved goes through the locked, capacity-checked path -
  //    everything else keeps the plain update
  let updated;
  let sweptEnrollments = [];

  if (newStatus === 'Approved') {
    const result = await approveShsEnrollmentWithLock(pool, publicId, enrollment.batch_id, externalRemarks);
    updated = result.updated;
    sweptEnrollments = result.sweptEnrollments;
  } else {
    updated = await updateShsEnrollmentStatus(pool, publicId, newStatus, externalRemarks);
  }

  // => Activity log entry - same pattern as TESDA / adminBatchServices.js
  const actorName = (await getAdminNameById(pool, adminId)) || 'Unknown';
  await logActivity(pool, {
    entity_type:   'shs_enrollment',
    entity_id:     enrollment.enrollment_id,
    actor_type:    'Admin',
    actor_id:      adminId,
    actor_name:    actorName,
    action:        `Status changed to ${newStatus}`,
    // => Same reasoning as TESDA - "action" already states the new
    //    status, this only adds previous status + remarks
    action_detail: `Previous status: ${enrollment.status}.${externalRemarks?.trim() ? ` Remarks: ${externalRemarks.trim()}` : ''}`,
  });

  // => Same per-enrollment audit entry for swept students as the TESDA
  //    version - see that function's comment for the full reasoning
  for (const swept of sweptEnrollments) {
    await logActivity(pool, {
      entity_type:   'shs_enrollment',
      entity_id:     swept.enrollment_id,
      actor_type:    'System',
      actor_id:      null,
      actor_name:    'System',
      action:        'Status changed to Reserved',
      action_detail: `Batch #${enrollment.batch_id} reached full capacity after another enrollment was approved - moved back to Reserved and unassigned from the batch to await placement in a future batch.`,
    });
  }

  // => Email notification - only fires when the status is actually
  // => changing, so re-saving the same status from the dashboard does
  // => not spam the student with a duplicate email
  // => Wrapped in try/catch and never rethrown - if Resend fails, the
  // => status change itself still succeeds, same "do not block on email"
  // => behavior as staffService.js's createAdmin
  if (newStatus !== enrollment.status) {
    const profile = await getProfileByStudentId(pool, enrollment.student_id);
    try {
      await sendEnrollmentStatusEmail({
        toEmail: enrollment.student_username,
        studentName: profile?.first_name || 'Student',
        enrollmentType: 'SHS',
        newStatus,
        courseOrTrack: enrollment.cluster,
        batchName: enrollment.batch_name,
        startDate: enrollment.start_date,
        externalRemarks,
      });
    } catch (emailError) {
      console.error('Enrollment status email failed:', emailError);
    }
  }

  return updated;
};
//
// SECTION UPDATES - resolve student_id from the enrollment first (since
//   profile/address aren't directly keyed by public_id), then delegate to
//   the shared model functions
//

export const updateShsProfileSection = async (publicId, fields) => {
  const enrollment = await getShsEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;
  return await updateProfile(pool, enrollment.student_id, fields);
};

export const updateShsAddressSection = async (publicId, fields) => {
  const enrollment = await getShsEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;
  return await updateAddress(pool, enrollment.student_id, fields);
};

export const updateShsEnrollmentSection = async (publicId, fields) => {
  return await updateShsEnrollmentFields(pool, publicId, fields);
};

export const updateShsFamilySection = async (publicId, members) => {
  const enrollment = await getShsEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;
  await replaceFamilyMembers(pool, enrollment.student_id, members);
  return await getFamilyMembersByStudentId(pool, enrollment.student_id);
};

//
// DOCUMENT ADD / REPLACE / DELETE
// => R2 upload happens in the controller (needs req.file from multer);
//    these just persist the resulting key against the right enrollment
//
export const addShsDocumentSection = async (publicId, docData) => {
  const enrollment = await getShsEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;
  return await addShsDocument(pool, enrollment.enrollment_id, docData);
};

export const replaceShsDocumentSection = async (docPublicId, documentKey) => {
  return await replaceShsDocument(pool, docPublicId, documentKey);
};

export const deleteShsDocumentSection = async (docPublicId) => {
  return await deleteShsDocument(pool, docPublicId);
};

//
// SHS CLASSES + LOOKUPS
//
export const fetchAvailableShsClasses = async (filters) => {
  return await getAvailableShsClasses(pool, filters);
};

export const fetchShsTracksAndClusters = async () => {
  return await getShsTracksAndClusters(pool);
};

// => Shared balance computation - used both by the For Assessment gate in
//    changeShsEnrollmentStatus and fetchShsPaymentHistory's balance
//    display, so the two never drift apart. No course fee component here
//    (DepEd covers SHS tuition) - misc fees are the entire balance.
const computeShsBalance = async (enrollment, payments) => {
  const totalPaid = payments
    .filter(p => p.status === 'Completed')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const miscFees = enrollment.batch_id
    ? await getMiscFeesByBatch(pool, 'SHS', enrollment.batch_id)
    : [];
  const totalRequired = miscFees.reduce((sum, f) => sum + Number(f.fee_amount), 0);

  return {
    totalPaid,
    totalRequired,
    balanceRemaining: Math.max(0, totalRequired - totalPaid),
  };
};

//
// PAYMENT HISTORY
// => Resolves publicId to enrollment_id, fetches Payments and Refunds in
//    parallel, tags each with record_type, and merges into one sorted
//    timeline - same shape as fetchTesdaPaymentHistory, minus the
//    reservation-fee total (SHS has no such gate). Also returns
//    batchMiscFeeTotal so the frontend's empty state can tell "no fee
//    assigned to this batch" apart from "fee assigned, unpaid."
//
export const fetchShsPaymentHistory = async (publicId) => {
  const enrollment = await getShsEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;

  const [payments, refunds, batchMiscFees] = await Promise.all([
    paymentsModel.findPaymentsForEnrollment('SHS', enrollment.enrollment_id),
    refundsModel.findRefundsForEnrollment('SHS', enrollment.enrollment_id),
    enrollment.batch_id ? getMiscFeesByBatch(pool, 'SHS', enrollment.batch_id) : Promise.resolve([]),
  ]);

  const records = [
    ...payments.map(p => ({
      public_id: p.public_id,
      reference_number: p.or_number,
      amount: Number(p.amount),
      record_date: p.payment_date,
      status: p.status,
      record_type: 'Payment',
    })),
    ...refunds.map(r => ({
      public_id: r.public_id,
      reference_number: r.refund_number,
      amount: Number(r.amount),
      record_date: r.created_at,
      status: r.status,
      record_type: 'Refund',
    })),
  ].sort((a, b) => new Date(b.record_date) - new Date(a.record_date));

  const batchMiscFeeTotal = batchMiscFees.reduce((sum, f) => sum + Number(f.fee_amount), 0);
  const totalPaid = payments
    .filter(p => p.status === 'Completed')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return { records, batchMiscFeeTotal, totalPaid };
};
