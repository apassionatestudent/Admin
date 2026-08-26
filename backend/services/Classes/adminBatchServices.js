// => admin/services/Classes/adminBatchServices.js
// => Mirrors adminFacilityService.js / adminTrainerService.js pattern
// => pool is imported here so controllers stay thin

import { pool } from '../../config/db.js';
import { logActivity, getActivityLogsForEntity } from '../../models/adminActivityLogModel.js';
// => Canonical action taxonomy - keeps every logActivity call in this file
//    aligned with the activity_logs_action_check constraint in Neon
import { ACTIVITY_ACTIONS } from '../../constants/activityActions.js';
import { buildFieldDiff, formatDiffDetail } from '../../utils/buildFieldDiff.js';

import {
  getActiveBatches,
  getTesdaBatchByPublicId,
  getShsBatchByPublicId,
  getShsBatchCourseTrainers,
  getEnrolledStudentsByTesdaBatchId,
  getEnrolledStudentsByShsBatchId,
  updateTesdaBatchStatus,
  updateShsBatchStatus,
  createTesdaBatch,
  createShsBatch,
  updateTesdaBatchDetails,
  updateShsBatchDetails,
  markShsBatchGrade11Completed,
  searchBatches,
  getBatchFormOptions,
  isTrainerQualifiedForTesdaCourse,
  isTrainerQualifiedForShsCourse,
  assignTesdaEnrollmentWithLock,
  assignShsEnrollmentWithLock,
  bulkReleaseTesdaEnrollmentsFromBatch,
  bulkReleaseShsEnrollmentsFromBatch,
  getAdminNameById,
  getTrainerNameById,
  getMiscFeesByBatch,
  addBatchMiscFee,
  deleteBatchMiscFee,
} from '../../models/Classes/adminBatchModel.js';

const ALLOWED_BATCH_STATUSES = ['Pending', 'Ongoing', 'Concluded', 'Dissolved'];

// => Marker prefix the controller looks for to distinguish "needs
//    confirmation" from a genuine hard error - see createShsBatchController
// => Shared date validation used by both create and edit, TESDA and SHS.
// => Both dates stay OPTIONAL at creation time - an admin may be pooling
//    students for enrollment before a firm schedule exists yet.
// => When start_date IS given, it can't be today or in the past - "can't
//    setup today and yesterday" per the standing rule.
// => CREATE-only. A brand new batch shouldn't be created already
//    "starting" today or in the past - when both dates are given,
//    end_date must also be strictly after start_date.
const validateBatchDates = (start_date, end_date) => {
  if (start_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(start_date);
    start.setHours(0, 0, 0, 0);
    if (start <= today) {
      throw new Error('start_date must be a future date - today or earlier is not allowed.');
    }
  }
  validateEndAfterStart(start_date, end_date);
};

// => Shared by create and edit - end_date must be strictly after
//    start_date, same day or earlier is rejected.
const validateEndAfterStart = (start_date, end_date) => {
  if (start_date && end_date) {
    const start = new Date(start_date);
    const end = new Date(end_date);
    if (end <= start) {
      throw new Error('end_date must be after start_date.');
    }
  }
};

// => EDIT-only, deliberately looser than CREATE. start_date is allowed
//    to be today - that's how a Pending batch naturally becomes eligible
//    for the manual Ongoing window (see checkOngoingEligibility above)
//    purely by the calendar catching up, with no edit needed at all.
//    What's blocked is genuine backdating (setting start_date to a day
//    that's already passed) - without this, an admin could reopen the
//    Edit form and manually type in today's date to force a stuck batch
//    through the Ongoing gate, defeating the point of that check.
// => Also blocks changing start_date AT ALL once the batch is already
//    Ongoing - at that point the batch has technically already begun,
//    so its start date is historical fact, not an editable plan. end_date
//    is deliberately NOT restricted here - a trainer's completion
//    estimate is expected to shift as the batch actually runs.
const validateStartDateOnEdit = (newStartDate, existingBatch) => {
  if (!newStartDate) return;

  if (existingBatch.status === 'Ongoing') {
    const existingDateStr = existingBatch.start_date
      ? new Date(existingBatch.start_date).toISOString().slice(0, 10)
      : null;
    const newDateStr = new Date(newStartDate).toISOString().slice(0, 10);
    if (newDateStr !== existingDateStr) {
      throw new Error('Cannot edit the start date - this batch has already started (status: Ongoing).');
    }
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(newStartDate);
  start.setHours(0, 0, 0, 0);
  if (start < today) {
    throw new Error('start_date cannot be set to a past date.');
  }
};

// GET ACTIVE BATCHES (Ongoing + Pending, combined)
export const fetchActiveBatches = async () => {
  return await getActiveBatches(pool);
};

// GET TESDA BATCH DETAIL
export const fetchTesdaBatchDetail = async (publicId) => {
  const batchRow = await getTesdaBatchByPublicId(pool, publicId);
  if (!batchRow) return null;

  const enrolledStudents = await getEnrolledStudentsByTesdaBatchId(pool, batchRow.batch_id);
  return { batchRow, enrolledStudents };
};

// GET SHS BATCH DETAIL
export const fetchShsBatchDetail = async (publicId) => {
  const batchRow = await getShsBatchByPublicId(pool, publicId);
  if (!batchRow) return null;

  const enrolledStudents = await getEnrolledStudentsByShsBatchId(pool, batchRow.batch_id);
  // => Per-course trainer assignments, replaces the old fixed
  //    grade11_trainer_id/grade12_trainer_id columns on batchRow
  const courseTrainers = await getShsBatchCourseTrainers(pool, batchRow.batch_id);
  return { batchRow, enrolledStudents, courseTrainers };
};

// => GET ACTIVITY LOGS FOR A BATCH - used by the Logs section on both
//    detail pages. entity_type strings ('tesda_batch'/'shs_batch') match
//    what batchAutoPromoteJob.js writes for the automatic Ongoing promotion.
export const fetchTesdaBatchLogs = async (publicId) => {
  const batchRow = await getTesdaBatchByPublicId(pool, publicId);
  if (!batchRow) return null;
  return await getActivityLogsForEntity(pool, 'tesda_batch', batchRow.batch_id);
};

export const fetchShsBatchLogs = async (publicId) => {
  const batchRow = await getShsBatchByPublicId(pool, publicId);
  if (!batchRow) return null;
  return await getActivityLogsForEntity(pool, 'shs_batch', batchRow.batch_id);
};

// => Shared eligibility checks for Ongoing/Concluded - both require a
//    trainer assigned and the relevant date to have already been
//    reached (today or earlier). Concluded stays open-ended on
//    purpose - an admin should be able to conclude a batch any day
//    after its end_date, not just within a narrow window.
const isDateReached = (dateStr) => {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return target <= today;
};

// => Narrow manual-Ongoing window: start_date must be today or
//    yesterday. Unlike Concluded, Ongoing is NOT open-ended - if an
//    admin is trying to manually push a batch to Ongoing days after
//    its start_date already passed, something is off (missing
//    trainer, forgotten batch, etc.) and should be investigated
//    rather than silently allowed through.
const isWithinManualOngoingWindow = (dateStr) => {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return target.getTime() === today.getTime() || target.getTime() === yesterday.getTime();
};

const checkOngoingEligibility = (trainerAssigned, start_date, approvedCount, requiredCount) => {
  if (!trainerAssigned) {
    throw new Error('Cannot set status to Ongoing - no trainer is assigned to this batch yet.');
  }
  if (!isWithinManualOngoingWindow(start_date)) {
    throw new Error('Cannot set status to Ongoing - this can only be done on the start date or the day after. Update the batch\'s start date first if it needs to begin today.');
  }
  // => New gate: an admin should not be able to manually force a batch
  //    to Ongoing before enough students have actually been approved
  //    into it, even if a trainer is assigned and the date window is open.
  if (approvedCount < requiredCount) {
    throw new Error(`Cannot set status to Ongoing - only ${approvedCount} of ${requiredCount} required students have been approved.`);
  }
};

const checkConcludedEligibility = (trainerAssigned, end_date) => {
  if (!trainerAssigned) {
    throw new Error('Cannot set status to Concluded - no trainer is assigned to this batch.');
  }
  if (!isDateReached(end_date)) {
    throw new Error('Cannot set status to Concluded - the end date has not been reached yet.');
  }
};

// => SHS-specific: at least one Grade 11 course must exist under the
//    cluster, and every single one of them needs a trainer assigned.
//    Grade 12 is deliberately NOT checked here - it doesn't start until
//    much later (grade11_completed flips first), so requiring a Grade 12
//    trainer this early would block an otherwise-ready batch for nothing.
const checkShsOngoingEligibility = (courseTrainers, start_date, approvedCount, requiredCount) => {
  const grade11Courses = courseTrainers.filter(c => c.grade_level === 'Grade 11');
  const allGrade11Staffed = grade11Courses.length > 0 && grade11Courses.every(c => !!c.trainer_id);
  if (!allGrade11Staffed) {
    throw new Error('Cannot set status to Ongoing - every Grade 11 course needs a trainer assigned first.');
  }
  if (!isWithinManualOngoingWindow(start_date)) {
    throw new Error('Cannot set status to Ongoing - this can only be done on the start date or the day after. Update the batch\'s start date first if it needs to begin today.');
  }
  // => Same headcount gate as the TESDA side above.
  if (approvedCount < requiredCount) {
    throw new Error(`Cannot set status to Ongoing - only ${approvedCount} of ${requiredCount} required students have been approved.`);
  }
};

const checkShsConcludedEligibility = (courseTrainers, end_date) => {
  const grade11Courses = courseTrainers.filter(c => c.grade_level === 'Grade 11');
  const allGrade11Staffed = grade11Courses.length > 0 && grade11Courses.every(c => !!c.trainer_id);
  if (!allGrade11Staffed) {
    throw new Error('Cannot set status to Concluded - every Grade 11 course needs a trainer assigned.');
  }
  if (!isDateReached(end_date)) {
    throw new Error('Cannot set status to Concluded - the end date has not been reached yet.');
  }
};

// UPDATE STATUS
export const changeTesdaBatchStatus = async (publicId, newStatus, remarks, adminId) => {
  if (!ALLOWED_BATCH_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }
  const remarksTrimmed = remarks?.trim() || null;
  if (!remarksTrimmed) {
    throw new Error('Remarks are required when changing the batch status.');
  }

  // => Fetched once - used for the Ongoing/Concluded eligibility checks
  //    below AND to record the previous status in the activity log
  const existing = await getTesdaBatchByPublicId(pool, publicId);
  if (!existing) throw new Error('Batch not found.');

  // => Once a batch leaves Pending, it can never go back - covers Ongoing
  //    (classes already started), Concluded (already finished), and
  //    Dissolved (already called off). "Not yet started" stops being true
  //    the moment any of those happen, so there's no valid path back to it
  if (existing.status !== 'Pending' && newStatus === 'Pending') {
    throw new Error(`Cannot revert to Pending - this batch is already ${existing.status}.`);
  }

  if (newStatus === 'Ongoing') {
    // => Reuses the same enrolled-students query the batch detail page
    //    calls, filtered down to just the Approved count needed here.
    const enrolledStudents = await getEnrolledStudentsByTesdaBatchId(pool, existing.batch_id);
    const approvedCount = enrolledStudents.filter(s => s.status === 'Approved').length;
    checkOngoingEligibility(!!existing.trainer_id, existing.start_date, approvedCount, existing.required_number_of_students);
  } else if (newStatus === 'Concluded') {
    checkConcludedEligibility(!!existing.trainer_id, existing.end_date);
  }

  const updated = await updateTesdaBatchStatus(pool, publicId, newStatus, remarksTrimmed);

  const actorName = (await getAdminNameById(pool, adminId)) || 'Unknown';
  await logActivity(pool, {
    entity_type:   'tesda_batch',
    entity_id:     existing.batch_id,
    actor_type:    'Staff',
    actor_id:      adminId,
    actor_name:    actorName,
    action:        ACTIVITY_ACTIONS.STATUS_CHANGE,
    action_detail: `Changed from ${existing.status} to ${newStatus}. Remarks: ${remarksTrimmed}`,
  });

  return updated;
};

export const changeShsBatchStatus = async (publicId, newStatus, remarks, adminId) => {
  if (!ALLOWED_BATCH_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }
  const remarksTrimmed = remarks?.trim() || null;
  if (!remarksTrimmed) {
    throw new Error('Remarks are required when changing the batch status.');
  }

  // => SHS trainer requirement is now per-course, not per-grade-slot -
  //    every Grade 11 course under this batch's cluster needs its own
  //    trainer assigned before the batch can go Ongoing
  const existing = await getShsBatchByPublicId(pool, publicId);
  if (!existing) throw new Error('Batch not found.');

  // => Same rule as the TESDA side above - once a batch leaves Pending
  //    (Ongoing, Concluded, or Dissolved), it can never go back to it
  if (existing.status !== 'Pending' && newStatus === 'Pending') {
    throw new Error(`Cannot revert to Pending - this batch is already ${existing.status}.`);
  }

  const courseTrainers = await getShsBatchCourseTrainers(pool, existing.batch_id);

  if (newStatus === 'Ongoing') {
    const enrolledStudents = await getEnrolledStudentsByShsBatchId(pool, existing.batch_id);
    const approvedCount = enrolledStudents.filter(s => s.status === 'Approved').length;
    checkShsOngoingEligibility(courseTrainers, existing.start_date, approvedCount, existing.required_number_of_students);
  } else if (newStatus === 'Concluded') {
    checkShsConcludedEligibility(courseTrainers, existing.end_date);
  }

  const updated = await updateShsBatchStatus(pool, publicId, newStatus, remarksTrimmed);

  const actorName = (await getAdminNameById(pool, adminId)) || 'Unknown';
  await logActivity(pool, {
    entity_type:   'shs_batch',
    entity_id:     existing.batch_id,
    actor_type:    'Staff',
    actor_id:      adminId,
    actor_name:    actorName,
    action:        ACTIVITY_ACTIONS.STATUS_CHANGE,
    action_detail: `Changed from ${existing.status} to ${newStatus}. Remarks: ${remarksTrimmed}`,
  });

  return updated;
};

// CREATE TESDA BATCH
// => Trainer qualification is a HARD block here, no override - mirrors the
//    real TESDA accreditation form: a trainer either is or isn't accredited
//    for a course, there's no "assign anyway" path
export const addTesdaBatch = async (batchData) => {
  const { course_id, trainer_id, start_date, end_date, required_number_of_students, max_students, max_applicants } = batchData;
  if (!course_id)                    throw new Error('course_id is required.');
  if (!required_number_of_students)  throw new Error('required_number_of_students is required.');
  if (!max_students)                 throw new Error('max_students is required.');
  if (!max_applicants)               throw new Error('max_applicants is required.');

  // => Dates are optional at creation - admins may just be pooling
  //    students for enrollment before a firm schedule exists
  validateBatchDates(start_date, end_date);

  if (Number(required_number_of_students) > Number(max_students)) {
    throw new Error('required_number_of_students cannot exceed max_students.');
  }
  // => max_students is the real Approved cap - it can never exceed the
  //    total applicant pool, since not everyone who applies gets approved
  if (Number(max_students) > Number(max_applicants)) {
    throw new Error('max_students cannot exceed max_applicants.');
  }

  if (trainer_id) {
    const qualified = await isTrainerQualifiedForTesdaCourse(pool, trainer_id, course_id);
    if (!qualified) {
      throw new Error('This trainer is not accredited for this course. Assign a qualified trainer, or leave the trainer field blank for now.');
    }
  }

  const created = await createTesdaBatch(pool, batchData);

  // => created_by is threaded through batchData by the controller, no
  //    separate adminId param needed for a create action
  const actorName = (await getAdminNameById(pool, batchData.created_by)) || 'Unknown';
  await logActivity(pool, {
    entity_type:   'tesda_batch',
    entity_id:     created.batch_id,
    actor_type:    'Staff',
    actor_id:      batchData.created_by,
    actor_name:    actorName,
    action:        ACTIVITY_ACTIONS.CREATE,
    action_detail: `Created batch "${created.batch_name}" (Batch #${created.batch_sequence}).`,
  });

  return created;
};

// CREATE SHS BATCH
// => Trainer qualification is now a HARD block, same as TESDA - the
//    dropdown itself only offers actually-qualified trainers, so this is
//    a safety net, not a UI-driven confirm flow. If a trainer genuinely
//    needs to substitute, the fix is updating their qualified courses on
//    the Trainers page first, not overriding it here.
export const addShsBatch = async (batchData) => {
  const {
    cluster_id, school_year, required_number_of_students, max_students, max_applicants,
    course_trainers,
  } = batchData;

  if (!cluster_id)    throw new Error('cluster_id is required.');
  if (!required_number_of_students) throw new Error('required_number_of_students is required.');
  if (!max_students) throw new Error('max_students is required.');
  if (!max_applicants) throw new Error('max_applicants is required.');

  if (Number(required_number_of_students) > Number(max_students)) {
    throw new Error('required_number_of_students cannot exceed max_students.');
  }
  // => Same pool-vs-approved-cap reasoning as addTesdaBatch
  if (Number(max_students) > Number(max_applicants)) {
    throw new Error('max_students cannot exceed max_applicants.');
  }

  if (batchData.start_date && batchData.end_date &&
      new Date(batchData.start_date) > new Date(batchData.end_date)) {
    throw new Error('start_date cannot be after end_date.');
  }

  // => Adds the "can't be today or in the past" restriction that this
  //    function was missing entirely before - the old check only ever
  //    caught start_date being after end_date, never a stale start_date
  validateBatchDates(batchData.start_date, batchData.end_date);

  // => Per-course qualification check, replaces the old two-field
  //    grade11/grade12 check - one entry per course under the cluster
  for (const { course_id, trainer_id } of (course_trainers || [])) {
    if (!trainer_id) continue; // => "Assign later" for this course - nothing to check
    const qualified = await isTrainerQualifiedForShsCourse(pool, trainer_id, course_id);
    if (!qualified) {
      throw new Error('One of the assigned trainers is not qualified for that course. Assign a qualified trainer, or leave the field blank for now.');
    }
  }

  const created = await createShsBatch(pool, batchData);

  const actorName = (await getAdminNameById(pool, batchData.created_by)) || 'Unknown';
  await logActivity(pool, {
    entity_type:   'shs_batch',
    entity_id:     created.batch_id,
    actor_type:    'Staff',
    actor_id:      batchData.created_by,
    actor_name:    actorName,
    action:        ACTIVITY_ACTIONS.CREATE,
    action_detail: `Created batch "${created.batch_name}" (Batch #${created.batch_sequence}).`,
  });

  return created;
};

// ════════════════════════════════════════════
// EDIT BATCH DETAILS (course_id / cluster are permanently locked, not
// accepted as params here at all - see the model layer comments for why)
// ════════════════════════════════════════════

// => TESDA trainer qualification stays a HARD block on edit too, same as
//    creation - no override path
export const editTesdaBatchDetails = async (publicId, batchData, existingBatch, adminId, batchId) => {
  const { trainer_id, start_date, end_date, required_number_of_students, max_students, max_applicants } = batchData;

  if (!required_number_of_students) throw new Error('required_number_of_students is required.');
  if (!max_students)                throw new Error('max_students is required.');
  if (!max_applicants)              throw new Error('max_applicants is required.');

  validateStartDateOnEdit(start_date, existingBatch);
  validateEndAfterStart(start_date, end_date);

  if (Number(required_number_of_students) > Number(max_students)) {
    throw new Error('required_number_of_students cannot exceed max_students.');
  }
  if (Number(max_students) > Number(max_applicants)) {
    throw new Error('max_students cannot exceed max_applicants.');
  }

  if (trainer_id) {
    const qualified = await isTrainerQualifiedForTesdaCourse(pool, trainer_id, existingBatch.course_id);
    if (!qualified) {
      throw new Error('This trainer is not accredited for this course. Assign a qualified trainer, or leave the trainer field blank for now.');
    }
  }

  const updated = await updateTesdaBatchDetails(pool, publicId, batchData);

  // => Trainer needs special handling here - batchData only carries the
  //    new trainer_id (a number), not a name, so it's resolved separately
  //    so the log reads "Trainer: none -> Master Chef" instead of the
  //    meaningless "trainer_id: null -> 5"
  const newTrainerName = trainer_id ? await getTrainerNameById(pool, trainer_id) : null;

  const changes = buildFieldDiff(
    {
      start_date:                  existingBatch.start_date,
      end_date:                    existingBatch.end_date,
      required_number_of_students: existingBatch.required_number_of_students,
      max_students:                existingBatch.max_students,
      max_applicants:              existingBatch.max_applicants,
      trainer_name:                existingBatch.trainer_name,
    },
    {
      start_date,
      end_date,
      required_number_of_students,
      max_students,
      max_applicants,
      trainer_name: newTrainerName,
    },
    {
      start_date:                  'Start Date',
      end_date:                    'End Date',
      required_number_of_students: 'Required Students',
      max_students:                'Max Students',
      max_applicants:              'Max Applicant Pool',
      trainer_name:                'Trainer',
    }
  );

  // => batchId is passed in from the controller (already had it from the
  //    existence check) rather than read off `updated`, so this doesn't
  //    depend on exactly which columns updateTesdaBatchDetails RETURNS
  const actorName = (await getAdminNameById(pool, adminId)) || 'Unknown';
  await logActivity(pool, {
    entity_type:   'tesda_batch',
    entity_id:     batchId,
    actor_type:    'Staff',
    actor_id:      adminId,
    actor_name:    actorName,
    action:        ACTIVITY_ACTIONS.UPDATE,
    action_detail: formatDiffDetail('Batch Information', changes),
  });

  return updated;
};

// => SHS trainer qualification keeps the same soft-confirm flow as creation
// => SHS trainer qualification is now a HARD block on edit too, matching
//    creation and TESDA - no more substitute confirm path
export const editShsBatchDetails = async (publicId, batchData, existingBatch, adminId, batchId) => {
  const {
    start_date, end_date, required_number_of_students, max_students, max_applicants,
    course_trainers,
  } = batchData;

  if (!required_number_of_students) throw new Error('required_number_of_students is required.');
  if (!max_students)                throw new Error('max_students is required.');
  if (!max_applicants)              throw new Error('max_applicants is required.');

  validateStartDateOnEdit(start_date, existingBatch);
  validateEndAfterStart(start_date, end_date);

  if (Number(required_number_of_students) > Number(max_students)) {
    throw new Error('required_number_of_students cannot exceed max_students.');
  }
  if (Number(max_students) > Number(max_applicants)) {
    throw new Error('max_students cannot exceed max_applicants.');
  }

  // => Per-course qualification check - existingBatch.cluster_id isn't
  //    needed here since course_id itself already identifies which
  //    cluster/grade it belongs to
  for (const { course_id, trainer_id } of (course_trainers || [])) {
    if (!trainer_id) continue; // => "Assign later" for this course - nothing to check
    const qualified = await isTrainerQualifiedForShsCourse(pool, trainer_id, course_id);
    if (!qualified) {
      throw new Error('One of the assigned trainers is not qualified for that course. Assign a qualified trainer, or leave the field blank for now.');
    }
  }

  // => Fetched BEFORE the update below runs, so this reflects the
  //    per-course trainer assignments as they stood prior to this save -
  //    updateShsBatchDetails overwrites shs_batch_course_trainers, so
  //    this has to be captured first or the "old" side of the diff would
  //    already be gone.
  const oldCourseTrainers = await getShsBatchCourseTrainers(pool, existingBatch.batch_id);

  const updated = await updateShsBatchDetails(pool, publicId, batchData);

  // => NOTE: school_year is deliberately excluded - the edit form has no
  //    input for it, so batchData.school_year is always undefined here.
  //    The model's COALESCE($1, school_year) correctly leaves the DB value
  //    untouched, but a raw diff would falsely show it "changing" to blank
  //    on every save since undefined normalizes to "" for comparison.
  const changes = buildFieldDiff(
    {
      start_date:                   existingBatch.start_date,
      end_date:                     existingBatch.end_date,
      required_number_of_students:  existingBatch.required_number_of_students,
      max_students:                 existingBatch.max_students,
      max_applicants:               existingBatch.max_applicants,
    },
    {
      start_date,
      end_date,
      required_number_of_students,
      max_students,
      max_applicants,
    },
    {
      start_date:                   'Start Date',
      end_date:                     'End Date',
      required_number_of_students:  'Required Students',
      max_students:                 'Max Students',
      max_applicants:               'Max Applicant Pool',
    }
  );

  // => Per-course trainer diff - course_trainers only carries numeric
  //    trainer_id values, so each new assignment is resolved to a name
  //    individually before comparing against the old assignment for that
  //    same course_id. Courses with no change (same trainer, or both
  //    still unassigned) are skipped, same as buildFieldDiff's own logic.
  const oldTrainerMap = new Map(oldCourseTrainers.map(c => [c.course_id, c.trainer_full_name]));
  for (const { course_id, trainer_id } of (course_trainers || [])) {
    const oldName = oldTrainerMap.get(course_id) ?? null;
    const newName = trainer_id ? await getTrainerNameById(pool, trainer_id) : null;
    if ((oldName || '') === (newName || '')) continue;

    const courseTitle = oldCourseTrainers.find(c => c.course_id === course_id)?.course_title || `Course #${course_id}`;
    changes.push(`Trainer (${courseTitle}): "${oldName || '-'}" => "${newName || '-'}"`);
  }

  const actorName = (await getAdminNameById(pool, adminId)) || 'Unknown';
  await logActivity(pool, {
    entity_type:   'shs_batch',
    entity_id:     batchId,
    actor_type:    'Staff',
    actor_id:      adminId,
    actor_name:    actorName,
    action:        ACTIVITY_ACTIONS.UPDATE,
    action_detail: formatDiffDetail('Batch Information', changes),
  });

  return updated;
};

// => One-way action - no corresponding "un-complete" endpoint, matching
//    how the frontend confirm dialog already frames it as irreversible
export const setShsBatchGrade11Completed = async (publicId, adminId, batchId) => {
  const updated = await markShsBatchGrade11Completed(pool, publicId);
  if (!updated) return null;

  const actorName = (await getAdminNameById(pool, adminId)) || 'Unknown';
  await logActivity(pool, {
    entity_type: 'shs_batch',
    entity_id: batchId,
    actor_type: 'Staff',
    actor_id: adminId,
    actor_name: actorName,
    action: ACTIVITY_ACTIONS.STATUS_CHANGE,
    action_detail: 'Grade 11 courses marked as completed for this batch. Only Grade 12 courses remain selectable for new class sessions.',
  });

  return updated;
};

// SEARCH
export const searchBatchesService = async (filters) => {
  const hasFilter = Object.values(filters).some(v => v && String(v).trim());
  if (!hasFilter) throw new Error('At least one search field is required.');

  // => 'ALL_STATUSES' is a frontend-only sentinel meaning "every status,
  //    no constraint". It's a real non-empty string, so it correctly
  //    counts toward hasFilter above (a genuinely empty, accidental
  //    search still gets rejected) - but the SQL layer needs an actual
  //    null here, not the literal word 'ALL_STATUSES', which would never
  //    match any real status enum value and would silently return zero rows
  const normalizedFilters = {
    ...filters,
    status: filters.status === 'ALL_STATUSES' ? null : filters.status,
  };

  return searchBatches(pool, normalizedFilters);
};

// FORM OPTIONS
export const fetchBatchFormOptions = async () => {
  return await getBatchFormOptions(pool);
};

// ════════════════════════════════════════════
// ASSIGN A RESERVED ENROLLMENT TO A BATCH
// => Validates course/cluster match and remaining capacity before writing
// ════════════════════════════════════════════

// ════════════════════════════════════════════
// ASSIGN A RESERVED ENROLLMENT TO A BATCH
// => Course/cluster match, pool cap, and Approved capacity are now all
//    validated INSIDE assignTesdaEnrollmentWithLock/assignShsEnrollmentWithLock,
//    under an advisory lock on the batch - this closes the race window
//    where two staff assigning into the same near-full batch at once
//    could both pass a check before either write committed. This
//    function is now just a thin pass-through.
// ════════════════════════════════════════════

export const assignTesdaEnrollment = async (enrollmentPublicId, batchPublicId, adminId) => {
  const updated = await assignTesdaEnrollmentWithLock(pool, enrollmentPublicId, batchPublicId);

  const actorName = (await getAdminNameById(pool, adminId)) || 'Unknown';
  await logActivity(pool, {
    entity_type:   'tesda_enrollment',
    entity_id:     updated.enrollment_id,
    actor_type:    'Staff',
    actor_id:      adminId,
    actor_name:    actorName,
    action:        ACTIVITY_ACTIONS.UPDATE,
    action_detail: `Assigned to Batch #${updated.batch_id}.`,
  });

  return updated;
};

export const assignShsEnrollment = async (enrollmentPublicId, batchPublicId, adminId) => {
  const updated = await assignShsEnrollmentWithLock(pool, enrollmentPublicId, batchPublicId);

  const actorName = (await getAdminNameById(pool, adminId)) || 'Unknown';
  await logActivity(pool, {
    entity_type:   'shs_enrollment',
    entity_id:     updated.enrollment_id,
    actor_type:    'Staff',
    actor_id:      adminId,
    actor_name:    actorName,
    action:        ACTIVITY_ACTIONS.UPDATE,
    action_detail: `Assigned to Batch #${updated.batch_id}.`,
  });

  return updated;
};

// ════════════════════════════════════════════
// BULK RELEASE: overflow back to Reserved
// => Manual trigger for the same outcome the automatic sweep produces -
//    only usable once the batch's Approved count has actually reached
//    max_students. Releases every remaining Pending/Reviewed/Needs
//    Clarification enrollment in the batch at once.
// ════════════════════════════════════════════

export const bulkReleaseTesdaEnrollments = async (batchPublicId, adminId) => {
  const batchRow = await getTesdaBatchByPublicId(pool, batchPublicId);
  if (!batchRow) throw new Error('Batch not found.');

  const released = await bulkReleaseTesdaEnrollmentsFromBatch(pool, batchRow.batch_id);

  const actorName = (await getAdminNameById(pool, adminId)) || 'Unknown';
  for (const r of released) {
    await logActivity(pool, {
      entity_type:   'tesda_enrollment',
      entity_id:     r.enrollment_id,
      actor_type:    'Staff',
      actor_id:      adminId,
      actor_name:    actorName,
      action:        ACTIVITY_ACTIONS.RELEASE,
      action_detail: `Bulk-released from Batch #${batchRow.batch_id} by staff after the batch reached full capacity - moved back to Reserved to await placement in a future batch.`,
    });
  }

  return released;
};

export const bulkReleaseShsEnrollments = async (batchPublicId, adminId) => {
  const batchRow = await getShsBatchByPublicId(pool, batchPublicId);
  if (!batchRow) throw new Error('Batch not found.');

  const released = await bulkReleaseShsEnrollmentsFromBatch(pool, batchRow.batch_id);

  const actorName = (await getAdminNameById(pool, adminId)) || 'Unknown';
  for (const r of released) {
    await logActivity(pool, {
      entity_type:   'shs_enrollment',
      entity_id:     r.enrollment_id,
      actor_type:    'Staff',
      actor_id:      adminId,
      actor_name:    actorName,
      action:        ACTIVITY_ACTIONS.RELEASE,
      action_detail: `Bulk-released from Batch #${batchRow.batch_id} by staff after the batch reached full capacity - moved back to Reserved to await placement in a future batch.`,
    });
  }

  return released;
};

//
// BATCH MISCELLANEOUS FEES
// => batchType is always 'TESDA' or 'SHS', passed explicitly by the
//    controller rather than inferred - keeps this function usable by
//    both without duplicating it per type.
//

export const fetchBatchMiscFees = async (batchType, publicId) => {
  const batchRow = batchType === 'SHS'
    ? await getShsBatchByPublicId(pool, publicId)
    : await getTesdaBatchByPublicId(pool, publicId);
  if (!batchRow) return null;

  const fees = await getMiscFeesByBatch(pool, batchType, batchRow.batch_id);
  const totalAmount = fees.reduce((sum, f) => sum + Number(f.fee_amount), 0);

  return { fees, totalAmount };
};

export const createBatchMiscFee = async (batchType, publicId, { feeLabel, feeAmount, adminId }) => {
  if (!feeLabel || !feeLabel.trim()) {
    throw new Error('feeLabel is required.');
  }
  const numericAmount = Number(feeAmount);
  if (!numericAmount || numericAmount <= 0) {
    throw new Error('feeAmount is required and must be a positive number.');
  }

  const batchRow = batchType === 'SHS'
    ? await getShsBatchByPublicId(pool, publicId)
    : await getTesdaBatchByPublicId(pool, publicId);
  if (!batchRow) throw new Error('Batch not found.');

  const created = await addBatchMiscFee(pool, {
    batchType,
    batchId: batchRow.batch_id,
    feeLabel: feeLabel.trim(),
    feeAmount: numericAmount,
    createdBy: adminId,
  });

  const actorName = (await getAdminNameById(pool, adminId)) || 'Unknown';
  await logActivity(pool, {
    entity_type:   batchType === 'SHS' ? 'shs_batch' : 'tesda_batch',
    entity_id:     batchRow.batch_id,
    actor_type:    'Staff',
    actor_id:      adminId,
    actor_name:    actorName,
    action:        ACTIVITY_ACTIONS.CREATE,
    action_detail: `Added "${created.fee_label}" - PHP ${numericAmount.toFixed(2)}`,
  });

  return created;
};

// => Delete doesn't need batchType passed in - the fee row itself already
//    knows which batch table it belongs to (returned by the model), so
//    the controller route for this can be a single shared DELETE
//    regardless of TESDA or SHS.
export const removeBatchMiscFee = async (feePublicId, adminId) => {
  const deleted = await deleteBatchMiscFee(pool, feePublicId);
  if (!deleted) throw new Error('Fee not found.');

  const actorName = (await getAdminNameById(pool, adminId)) || 'Unknown';
  await logActivity(pool, {
    entity_type:   deleted.batch_type === 'SHS' ? 'shs_batch' : 'tesda_batch',
    entity_id:     deleted.batch_id,
    actor_type:    'Staff',
    actor_id:      adminId,
    actor_name:    actorName,
    action:        ACTIVITY_ACTIONS.DELETE,
    action_detail: `Removed "${deleted.fee_label}" - PHP ${Number(deleted.fee_amount).toFixed(2)}`,
  });

  return deleted;
};