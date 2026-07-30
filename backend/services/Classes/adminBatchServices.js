// => admin/services/Classes/adminBatchServices.js
// => Mirrors adminFacilityService.js / adminTrainerService.js pattern
// => pool is imported here so controllers stay thin

import { pool } from '../../config/db.js';
import { logActivity, getActivityLogsForEntity } from '../../models/adminActivityLogModel.js';

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
  getTesdaAssignmentContext,
  assignTesdaEnrollmentToBatch,
  getShsAssignmentContext,
  assignShsEnrollmentToBatch,
  getAdminNameById,
} from '../../models/Classes/adminBatchModel.js';

const ALLOWED_BATCH_STATUSES = ['Pending', 'Ongoing', 'Concluded', 'Dissolved'];

// => Marker prefix the controller looks for to distinguish "needs
//    confirmation" from a genuine hard error - see createShsBatchController
// => Shared date validation used by both create and edit, TESDA and SHS.
// => Both dates stay OPTIONAL at creation time - an admin may be pooling
//    students for enrollment before a firm schedule exists yet.
// => When start_date IS given, it can't be today or in the past - "can't
//    setup today and yesterday" per the standing rule.
// => When both dates are given, end_date must be strictly after start_date
//    - same day or earlier is rejected.
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
  if (start_date && end_date) {
    const start = new Date(start_date);
    const end = new Date(end_date);
    if (end <= start) {
      throw new Error('end_date must be after start_date.');
    }
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
//    reached (today or earlier). This same isDateReached helper will
//    also back the automatic Pending -> Ongoing promotion once that
//    piece is wired up.
const isDateReached = (dateStr) => {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return target <= today;
};

const checkOngoingEligibility = (trainerAssigned, start_date) => {
  if (!trainerAssigned) {
    throw new Error('Cannot set status to Ongoing - no trainer is assigned to this batch yet.');
  }
  if (!isDateReached(start_date)) {
    throw new Error('Cannot set status to Ongoing - the start date has not been reached yet.');
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
const checkShsOngoingEligibility = (courseTrainers, start_date) => {
  const grade11Courses = courseTrainers.filter(c => c.grade_level === 'Grade 11');
  const allGrade11Staffed = grade11Courses.length > 0 && grade11Courses.every(c => !!c.trainer_id);
  if (!allGrade11Staffed) {
    throw new Error('Cannot set status to Ongoing - every Grade 11 course needs a trainer assigned first.');
  }
  if (!isDateReached(start_date)) {
    throw new Error('Cannot set status to Ongoing - the start date has not been reached yet.');
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

  if (newStatus === 'Ongoing') {
    checkOngoingEligibility(!!existing.trainer_id, existing.start_date);
  } else if (newStatus === 'Concluded') {
    checkConcludedEligibility(!!existing.trainer_id, existing.end_date);
  }

  const updated = await updateTesdaBatchStatus(pool, publicId, newStatus, remarksTrimmed);

  const actorName = (await getAdminNameById(pool, adminId)) || 'Unknown';
  await logActivity(pool, {
    entity_type:   'tesda_batch',
    entity_id:     existing.batch_id,
    actor_type:    'Admin',
    actor_id:      adminId,
    actor_name:    actorName,
    action:        `Status changed to ${newStatus}`,
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
  const courseTrainers = await getShsBatchCourseTrainers(pool, existing.batch_id);

  if (newStatus === 'Ongoing') {
    checkShsOngoingEligibility(courseTrainers, existing.start_date);
  } else if (newStatus === 'Concluded') {
    checkShsConcludedEligibility(courseTrainers, existing.end_date);
  }

  const updated = await updateShsBatchStatus(pool, publicId, newStatus, remarksTrimmed);

  const actorName = (await getAdminNameById(pool, adminId)) || 'Unknown';
  await logActivity(pool, {
    entity_type:   'shs_batch',
    entity_id:     existing.batch_id,
    actor_type:    'Admin',
    actor_id:      adminId,
    actor_name:    actorName,
    action:        `Status changed to ${newStatus}`,
    action_detail: `Changed from ${existing.status} to ${newStatus}. Remarks: ${remarksTrimmed}`,
  });

  return updated;
};

// CREATE TESDA BATCH
// => Trainer qualification is a HARD block here, no override - mirrors the
//    real TESDA accreditation form: a trainer either is or isn't accredited
//    for a course, there's no "assign anyway" path
export const addTesdaBatch = async (batchData) => {
  const { course_id, trainer_id, start_date, end_date, required_number_of_students, max_students } = batchData;
  if (!course_id)                    throw new Error('course_id is required.');
  if (!required_number_of_students)  throw new Error('required_number_of_students is required.');
  if (!max_students)                 throw new Error('max_students is required.');

  // => Dates are optional at creation - admins may just be pooling
  //    students for enrollment before a firm schedule exists
  validateBatchDates(start_date, end_date);

  if (Number(required_number_of_students) > Number(max_students)) {
    throw new Error('required_number_of_students cannot exceed max_students.');
  }

  if (trainer_id) {
    const qualified = await isTrainerQualifiedForTesdaCourse(pool, trainer_id, course_id);
    if (!qualified) {
      throw new Error('This trainer is not accredited for this course. Assign a qualified trainer, or leave the trainer field blank for now.');
    }
  }

  return await createTesdaBatch(pool, batchData);
};

// CREATE SHS BATCH
// => Trainer qualification is now a HARD block, same as TESDA - the
//    dropdown itself only offers actually-qualified trainers, so this is
//    a safety net, not a UI-driven confirm flow. If a trainer genuinely
//    needs to substitute, the fix is updating their qualified courses on
//    the Trainers page first, not overriding it here.
export const addShsBatch = async (batchData) => {
  const {
    cluster_id, school_year, required_number_of_students, max_students,
    course_trainers,
  } = batchData;

  if (!cluster_id)    throw new Error('cluster_id is required.');
  if (!required_number_of_students) throw new Error('required_number_of_students is required.');
  if (!max_students) throw new Error('max_students is required.');

  if (Number(required_number_of_students) > Number(max_students)) {
    throw new Error('required_number_of_students cannot exceed max_students.');
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

  return await createShsBatch(pool, batchData);
};

// ════════════════════════════════════════════
// EDIT BATCH DETAILS (course_id / cluster are permanently locked, not
// accepted as params here at all - see the model layer comments for why)
// ════════════════════════════════════════════

// => TESDA trainer qualification stays a HARD block on edit too, same as
//    creation - no override path
export const editTesdaBatchDetails = async (publicId, batchData, existingCourseId, adminId, batchId) => {
  const { trainer_id, start_date, end_date, required_number_of_students, max_students } = batchData;

  if (!required_number_of_students) throw new Error('required_number_of_students is required.');
  if (!max_students)                throw new Error('max_students is required.');

  validateBatchDates(start_date, end_date);

  if (Number(required_number_of_students) > Number(max_students)) {
    throw new Error('required_number_of_students cannot exceed max_students.');
  }

  if (trainer_id) {
    const qualified = await isTrainerQualifiedForTesdaCourse(pool, trainer_id, existingCourseId);
    if (!qualified) {
      throw new Error('This trainer is not accredited for this course. Assign a qualified trainer, or leave the trainer field blank for now.');
    }
  }

  const updated = await updateTesdaBatchDetails(pool, publicId, batchData);

  // => batchId is passed in from the controller (already had it from the
  //    existence check) rather than read off `updated`, so this doesn't
  //    depend on exactly which columns updateTesdaBatchDetails RETURNS
  const actorName = (await getAdminNameById(pool, adminId)) || 'Unknown';
  await logActivity(pool, {
    entity_type:   'tesda_batch',
    entity_id:     batchId,
    actor_type:    'Admin',
    actor_id:      adminId,
    actor_name:    actorName,
    action:        'Batch information updated',
    // => action_detail is NOT NULL on the live table - a plain string
    //    instead of null, since this edit touches several fields at once
    //    and there's no single "before -> after" value to summarize
    action_detail: 'Updated batch information.',
  });

  return updated;
};

// => SHS trainer qualification keeps the same soft-confirm flow as creation
// => SHS trainer qualification is now a HARD block on edit too, matching
//    creation and TESDA - no more substitute confirm path
export const editShsBatchDetails = async (publicId, batchData, existingClusterId, adminId, batchId) => {
  const {
    school_year, start_date, end_date, required_number_of_students, max_students,
    course_trainers,
  } = batchData;

  if (!required_number_of_students) throw new Error('required_number_of_students is required.');
  if (!max_students)                throw new Error('max_students is required.');

  validateBatchDates(start_date, end_date);

  if (Number(required_number_of_students) > Number(max_students)) {
    throw new Error('required_number_of_students cannot exceed max_students.');
  }

  // => Same per-course qualification check as addShsBatch - existingClusterId
  //    isn't even needed anymore here since course_id itself already
  //    identifies which cluster/grade it belongs to
  for (const { course_id, trainer_id } of (course_trainers || [])) {
    if (!trainer_id) continue; // => "Assign later" for this course - nothing to check
    const qualified = await isTrainerQualifiedForShsCourse(pool, trainer_id, course_id);
    if (!qualified) {
      throw new Error('One of the assigned trainers is not qualified for that course. Assign a qualified trainer, or leave the field blank for now.');
    }
  }

  const updated = await updateShsBatchDetails(pool, publicId, batchData);

  const actorName = (await getAdminNameById(pool, adminId)) || 'Unknown';
  await logActivity(pool, {
    entity_type:   'shs_batch',
    entity_id:     batchId,
    actor_type:    'Admin',
    actor_id:      adminId,
    actor_name:    actorName,
    action:        'Batch information updated',
    // => action_detail is NOT NULL on the live table - a plain string
    //    instead of null, since this edit touches several fields at once
    //    and there's no single "before -> after" value to summarize
    action_detail: 'Updated batch information.',
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
    actor_type: 'Admin',
    actor_id: adminId,
    actor_name: actorName,
    action: 'Grade 11 marked completed',
    action_detail: 'Grade 11 courses marked as completed for this batch. Only Grade 12 courses remain selectable for new class sessions.',
  });

  return updated;
};

// SEARCH
export const searchBatchesService = async (filters) => {
  const hasFilter = Object.values(filters).some(v => v && String(v).trim());
  if (!hasFilter) throw new Error('At least one search field is required.');
  return searchBatches(pool, filters);
};

// FORM OPTIONS
export const fetchBatchFormOptions = async () => {
  return await getBatchFormOptions(pool);
};

// ════════════════════════════════════════════
// ASSIGN A RESERVED ENROLLMENT TO A BATCH
// => Validates course/cluster match and remaining capacity before writing
// ════════════════════════════════════════════

export const assignTesdaEnrollment = async (enrollmentPublicId, batchPublicId) => {
  const ctx = await getTesdaAssignmentContext(pool, enrollmentPublicId, batchPublicId);
  if (!ctx || !ctx.batch_id) {
    throw new Error('Enrollment or batch not found.');
  }
  if (ctx.enrollment_course_id !== ctx.batch_course_id) {
    throw new Error('This batch does not offer the course the student enrolled in.');
  }
  if (ctx.current_batch_count >= ctx.max_students) {
    throw new Error('This batch is already full.');
  }

  return await assignTesdaEnrollmentToBatch(pool, enrollmentPublicId, ctx.batch_id);
};

export const assignShsEnrollment = async (enrollmentPublicId, batchPublicId) => {
  const ctx = await getShsAssignmentContext(pool, enrollmentPublicId, batchPublicId);
  if (!ctx || !ctx.batch_id) {
    throw new Error('Enrollment or batch not found.');
  }
  if (ctx.enrollment_cluster_id && ctx.enrollment_cluster_id !== ctx.batch_cluster_id) {
    throw new Error("This batch does not match the student's cluster.");
  }
  if (ctx.current_batch_count >= ctx.max_students) {
    throw new Error('This batch is already full.');
  }

  return await assignShsEnrollmentToBatch(pool, enrollmentPublicId, ctx.batch_id);
};
