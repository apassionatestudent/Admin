// => admin/services/Enrollments/tesdaEnrollmentService.js
// => Split out of the old adminEnrollmentService.js - TESDA-only logic.
//    Shared profile/address/guardian model functions and ALLOWED_STATUSES
//    are imported from the shared files below.

import { pool } from '../../config/db.js';

import {
  getProfileByStudentId,
  getAddressByStudentId,
  getGuardianByStudentId,
  updateProfile,
  updateAddress,
  upsertGuardian,
  getAdminNameById,
} from '../../models/Enrollments/sharedEnrollmentModel.js';

// => Same activity-log helper Batches already uses - see
//    adminBatchServices.js's changeTesdaBatchStatus for the pattern
import { logActivity, getActivityLogsForEntity } from '../../models/adminActivityLogModel.js';

import {
  getTesdaEnrollmentDetailByPublicId,
  getTesdaDocsByEnrollmentId,
  getClassificationsByEnrollmentId,
  updateTesdaEnrollmentStatus,
  approveTesdaEnrollmentWithLock,
  updateTesdaEnrollmentFields,
  replaceClassifications,
  addTesdaDocument,
  replaceTesdaDocument,
  deleteTesdaDocument,
  getAvailableTesdaClasses,
} from '../../models/Enrollments/tesdaEnrollmentModel.js';

import { ALLOWED_STATUSES } from './sharedEnrollmentService.js';

// => Payment History section pulls from both Payments and Refunds -
//    each model stays strictly single-table, the merge happens here.
import * as paymentsModel from '../../models/Payments/paymentsModel.js';
import * as refundsModel from '../../models/Payments/refundsModel.js';
// => Needed for the For Assessment balance check - same helper
//    shsEnrollmentService.js already uses for its Payment History section
import { getMiscFeesByBatch } from '../../models/Classes/adminBatchModel.js';

//
// TESDA DETAIL: enrollment + shared profile/address/guardian + TESDA-only
//   docs and client classifications, assembled into one response bundle
//
export const fetchTesdaEnrollmentDetail = async (publicId) => {
  const enrollment = await getTesdaEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;

  const [profile, address, guardian, docs, classifications, rawLogs] = await Promise.all([
    getProfileByStudentId(pool, enrollment.student_id),
    getAddressByStudentId(pool, enrollment.student_id),
    getGuardianByStudentId(pool, enrollment.student_id),
    getTesdaDocsByEnrollmentId(pool, enrollment.enrollment_id),
    getClassificationsByEnrollmentId(pool, enrollment.enrollment_id),
    getActivityLogsForEntity(pool, 'tesda_enrollment', enrollment.enrollment_id),
  ]);

  // => activity_logs has no previous_status/new_status/remarks columns -
  //    it's the generic system-wide table, not a dedicated enrollment log.
  //    Mapped here into the shape tesdaEnrollmentDetail.jsx's Audit Log
  //    section already expects, so no frontend changes were needed to
  //    wire this up.
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
    guardian,
    docs,
    classifications,
    logs,
  };
};

// => ₱1,000 reservation fee, required in full before a TESDA Regular
//    enrollment can move to Approved. Modular/other class_types skip
//    this check entirely - only Regular carries the reservation fee rule.
const RESERVATION_FEE_AMOUNT = 1000;

// => Shared balance computation - used both by the For Assessment gate
//    below and by fetchTesdaPaymentHistory's balance display, so the two
//    never drift apart. Takes payments as a param rather than re-querying,
//    since fetchTesdaPaymentHistory already has them fetched.
const computeTesdaBalance = async (enrollment, payments) => {
  const totalPaid = payments
    .filter(p => p.status === 'Completed')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const miscFees = enrollment.batch_id
    ? await getMiscFeesByBatch(pool, 'TESDA', enrollment.batch_id)
    : [];
  const miscFeeTotal = miscFees.reduce((sum, f) => sum + Number(f.fee_amount), 0);

  const courseFeeRequired = enrollment.class_type === 'Regular' ? Number(enrollment.fee_at_enrollment || 0) : 0;
  const totalRequired = courseFeeRequired + miscFeeTotal;

  return {
    totalPaid,
    courseFeeRequired,
    miscFeeTotal,
    totalRequired,
    balanceRemaining: Math.max(0, totalRequired - totalPaid),
  };
};

//
// STATUS UPDATE
// => Reservation fee gate runs only when the target status is Approved,
//    and only for Regular batches. Uses the same 'Completed' filter as
//    fetchTesdaPaymentHistory's totalPaid, so this stays consistent with
//    what the Payment History section already shows the admin.
//
export const changeTesdaEnrollmentStatus = async (publicId, newStatus, externalRemarks, adminId) => {
  if (!ALLOWED_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }

  // => Needs Clarification is shown to the student on their dashboard -
  //    without a note there's nothing telling them what to actually fix
  if (newStatus === 'Needs Clarification' && !externalRemarks?.trim()) {
    throw new Error('External remarks are required when setting status to "Needs Clarification".');
  }

  // => Fetched unconditionally now (previously only inside the gated
  //    block) - needed for every status change now, not just the gated
  //    ones, since the activity log entry below needs enrollment_id and
  //    the previous status regardless of what's being set.
  const enrollment = await getTesdaEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;

  // => Reserved is for enrollments that do NOT yet have a batch - once
  //    a batch is assigned, the enrollment should move through the
  //    normal Approved -> For Assessment flow instead of sitting as
  //    Reserved
  if (newStatus === 'Reserved' && enrollment.batch_id) {
    throw new Error('Cannot set status to Reserved: a batch is already assigned to this enrollment.');
  }

  // => Approval requires the enrollment to currently be in Reviewed
  //    status - staff must review the digital submission and confirm
  //    physical documents first. Skipped when already Approved, so
  //    re-saving the same status doesn't trip this.
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

  // => class_type comes from the LEFT JOIN on tesda_batches - NULL when
  //    no batch is assigned yet, so the rule is skipped in that case
  if (newStatus === 'Approved' && enrollment.class_type === 'Regular') {
    const payments = await paymentsModel.findPaymentsForEnrollment('TESDA', enrollment.enrollment_id);
    const totalPaid = payments
      .filter(p => p.status === 'Completed')
      .reduce((sum, p) => sum + Number(p.amount), 0);

    if (totalPaid < RESERVATION_FEE_AMOUNT) {
      throw new Error(
        `Reservation fee not fully paid. Paid ₱${totalPaid.toFixed(2)} of ₱${RESERVATION_FEE_AMOUNT.toFixed(2)} required before approval.`
      );
    }
  }

  // => For Assessment requires the enrollment to already be Approved
  if (newStatus === 'For Assessment' && enrollment.status !== 'Approved' && enrollment.status !== 'For Assessment') {
    throw new Error(
      `Cannot set status to "For Assessment": enrollment must be Approved first. Current status: "${enrollment.status}".`
    );
  }

  // => For Assessment also requires a batch to still be assigned. A
  //    student normally picks one before Approved is even possible, but
  //    this guards against the batch being removed or dissolved
  //    afterward - without this, the balance check below would
  //    trivially pass at ₱0 required.
  if (newStatus === 'For Assessment' && !enrollment.batch_id) {
    throw new Error('Cannot set status to "For Assessment": no batch is assigned to this enrollment.');
  }

  // => For Assessment also requires the batch's training period to have
  //    actually ended - today must be on or after end_date. Missing
  //    end_date counts as not yet ended, since there's nothing to
  //    confirm training finished against.
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

  // => For Assessment also requires the full balance cleared - course
  //    amount for Regular TESDA batches, plus whatever misc fees are
  //    assigned to the batch. See computeTesdaBalance for the exact
  //    breakdown - shared with the payment-history endpoint's balance
  //    display so the numbers always match what the admin sees on-page.
  if (newStatus === 'For Assessment') {
    const payments = await paymentsModel.findPaymentsForEnrollment('TESDA', enrollment.enrollment_id);
    const { totalPaid, totalRequired } = await computeTesdaBalance(enrollment, payments);

    if (totalPaid < totalRequired) {
      throw new Error(
        `Cannot set status to "For Assessment": balance not fully cleared. Paid ₱${totalPaid.toFixed(2)} of ₱${totalRequired.toFixed(2)} required.`
      );
    }
  }

  // => Failed Assessment requires the enrollment to already be For
  //    Assessment - can't fail an assessment that was never scheduled.
  if (newStatus === 'Failed Assessment' && enrollment.status !== 'For Assessment' && enrollment.status !== 'Failed Assessment') {
    throw new Error(
      `Cannot set status to "Failed Assessment": enrollment must be in "For Assessment" status first. Current status: "${enrollment.status}".`
    );
  }

  // => Approved goes through the locked, capacity-checked path -
  //    everything else keeps the plain update, since only Approved
  //    consumes a batch slot
  let updated;
  let sweptEnrollments = [];

  if (newStatus === 'Approved') {
    const result = await approveTesdaEnrollmentWithLock(pool, publicId, enrollment.batch_id, externalRemarks);
    updated = result.updated;
    sweptEnrollments = result.sweptEnrollments;
  } else {
    updated = await updateTesdaEnrollmentStatus(pool, publicId, newStatus, externalRemarks);
  }

  // => Activity log entry - mirrors adminBatchServices.js's
  //    changeTesdaBatchStatus pattern exactly
  const actorName = (await getAdminNameById(pool, adminId)) || 'Unknown';
  await logActivity(pool, {
    entity_type:   'tesda_enrollment',
    entity_id:     enrollment.enrollment_id,
    actor_type:    'Admin',
    actor_id:      adminId,
    actor_name:    actorName,
    action:        `Status changed to ${newStatus}`,
    // => "action" already states the new status, so this only adds the
    //    previous status plus remarks - avoids restating "changed to X"
    //    twice once this renders in the Audit Log section
    action_detail: `Previous status: ${enrollment.status}.${externalRemarks?.trim() ? ` Remarks: ${externalRemarks.trim()}` : ''}`,
  });

  // => Each swept enrollment gets its own audit trail entry explaining
  //    why it landed back on Reserved - the batch filled up before it
  //    could be approved. actor_type 'System' since no individual staff
  //    member made this specific call, the sweep is a side effect of
  //    approving a different enrollment.
  for (const swept of sweptEnrollments) {
    await logActivity(pool, {
      entity_type:   'tesda_enrollment',
      entity_id:     swept.enrollment_id,
      actor_type:    'System',
      actor_id:      null,
      actor_name:    'System',
      action:        'Status changed to Reserved',
      action_detail: `Batch #${enrollment.batch_id} reached full capacity after another enrollment was approved - moved back to Reserved and unassigned from the batch to await placement in a future batch.`,
    });
  }

  return updated;
};

//
// SECTION UPDATES - resolve student_id from the enrollment first (since
//   profile/address/guardian aren't directly keyed by public_id), then
//   delegate to the shared model functions
//

export const updateTesdaProfileSection = async (publicId, fields) => {
  const enrollment = await getTesdaEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;
  return await updateProfile(pool, enrollment.student_id, fields);
};

export const updateTesdaAddressSection = async (publicId, fields) => {
  const enrollment = await getTesdaEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;
  return await updateAddress(pool, enrollment.student_id, fields);
};

export const updateTesdaGuardianSection = async (publicId, fields) => {
  const enrollment = await getTesdaEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;
  return await upsertGuardian(pool, enrollment.student_id, fields);
};

export const updateTesdaEnrollmentSection = async (publicId, fields) => {
  return await updateTesdaEnrollmentFields(pool, publicId, fields);
};

export const updateTesdaClassificationsSection = async (publicId, classifications, othersText) => {
  const enrollment = await getTesdaEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;
  await replaceClassifications(pool, enrollment.enrollment_id, classifications, othersText);
  return await getClassificationsByEnrollmentId(pool, enrollment.enrollment_id);
};

//
// DOCUMENT ADD / REPLACE / DELETE
// => R2 upload happens in the controller (needs req.file from multer);
//    these just persist the resulting key against the right enrollment
//
export const addTesdaDocumentSection = async (publicId, docData) => {
  const enrollment = await getTesdaEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;
  return await addTesdaDocument(pool, enrollment.enrollment_id, docData);
};

export const replaceTesdaDocumentSection = async (docPublicId, documentKey) => {
  return await replaceTesdaDocument(pool, docPublicId, documentKey);
};

export const deleteTesdaDocumentSection = async (docPublicId) => {
  return await deleteTesdaDocument(pool, docPublicId);
};

//
// TESDA CLASSES
//
export const fetchAvailableTesdaClasses = async (filters) => {
  return await getAvailableTesdaClasses(pool, filters);
};

//
// PAYMENT HISTORY
// => Resolves publicId to enrollment_id the same way every other section
//    update does, then fetches Payments and Refunds in parallel, tags
//    each row with record_type, and merges into one sorted timeline.
//    totalPaid (Completed payments only) feeds the Reservation Fee note
//    on the frontend.
//
export const fetchTesdaPaymentHistory = async (publicId) => {
  const enrollment = await getTesdaEnrollmentDetailByPublicId(pool, publicId);
  if (!enrollment) return null;

  const [payments, refunds] = await Promise.all([
    paymentsModel.findPaymentsForEnrollment('TESDA', enrollment.enrollment_id),
    refundsModel.findRefundsForEnrollment('TESDA', enrollment.enrollment_id),
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

  const balance = await computeTesdaBalance(enrollment, payments);

  return { records, ...balance };
};
