// => services/Classes/adminTrainerService.js
// => Validation + orchestration layer - controller stays req/res-only,
//    model stays pure SQL, business rules live here.

import { pool } from '../../config/db.js';
import {
  getActiveTrainers,
  getDeletedTrainers,
  createTrainerWithCourses,
  getTrainerById,
  getTrainerIdByPublicId,
  updateTrainerWithCourses,
  softDeleteTrainer,
  restoreTrainer,
  getTesdaCourseTitlesByIds,
  getShsCourseTitlesByIds,
} from '../../models/Classes/adminTrainerModel.js';
// => Non-paginated fetch, matches the Batches/Facilities pattern - one
//    trainer won't accumulate enough log rows to need pagination
import { logActivity, getActivityLogsForEntity } from '../../models/adminActivityLogModel.js';
// => Canonical action taxonomy - replaces the free-text action strings below,
//    which were silently failing logActivity's INSERT against the
//    activity_logs_action_check constraint (same bug pattern found in
//    Class Sessions, Batches, and Facilities)
import { ACTIVITY_ACTIONS } from '../../constants/activityActions.js';
// => Real old -> new diff builder, same pattern already used on
//    Enrollments, Batches, and Facilities
import { buildFieldDiff, formatDiffDetail } from '../../utils/buildFieldDiff.js';

// => Shared validation: at least one program type enabled, and every
//    enabled program type has at least one course selected. Used by both
//    addTrainer and editTrainer so the rule can't drift between them.
const validateProgramTypeSelection = (handles_tesda, handles_shs, tesda_course_ids, shs_course_ids) => {
  if (!handles_tesda && !handles_shs) {
    throw new Error('Select whether this trainer handles TESDA courses, SHS courses, or both.');
  }
  if (handles_tesda && (tesda_course_ids?.length || 0) === 0) {
    throw new Error('Select at least one TESDA course for this trainer.');
  }
  if (handles_shs && (shs_course_ids?.length || 0) === 0) {
    throw new Error('Select at least one SHS course for this trainer.');
  }
};

// => Philippine mobile format: must start with 09, exactly 11 digits total
const PHONE_REGEX = /^09\d{9}$/;

// => Standard broad email format - accepts gmail/icloud/yahoo/outlook/custom
//    domains alike, doesn't whitelist specific providers
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// GET ACTIVE TRAINERS
export const fetchActiveTrainers = async () => {
  return await getActiveTrainers(pool);
};

// GET DELETED TRAINERS
export const fetchDeletedTrainers = async () => {
  return await getDeletedTrainers(pool);
};

// CREATE TRAINER
export const addTrainer = async (data, actor) => {
  const { trainer_full_name, contact_number, handles_tesda, handles_shs, tesda_course_ids, shs_course_ids } = data;

  if (!trainer_full_name || !trainer_full_name.trim()) {
    throw new Error('Trainer name is required.');
  }
  if (!contact_number || !contact_number.trim()) {
    throw new Error('Contact number is required.');
  }
  if (!PHONE_REGEX.test(contact_number.trim())) {
    throw new Error('Contact number must start with 09 and be 11 digits long.');
  }

  const emailTrimmed = data.email?.trim() || null;
  if (emailTrimmed && !EMAIL_REGEX.test(emailTrimmed)) {
    throw new Error('Please enter a valid email address.');
  }

  validateProgramTypeSelection(!!handles_tesda, !!handles_shs, tesda_course_ids, shs_course_ids);

  const created = await createTrainerWithCourses(pool, {
    trainer_full_name: trainer_full_name.trim(),
    contact_number: contact_number.trim(),
    email: emailTrimmed,
    handles_tesda: !!handles_tesda,
    handles_shs: !!handles_shs,
    tesda_course_ids: tesda_course_ids || [],
    shs_course_ids: shs_course_ids || [],
    created_by: data.created_by,
    // => Optional on creation - nothing to explain yet on a brand new trainer
    remarks: data.remarks?.trim() || null,
  });

  await logActivity(pool, {
    entity_type: 'trainer',
    entity_id: created.trainer_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.CREATE,
    action_detail: `Created trainer "${created.trainer_full_name}".`,
  });

  return created;
};

// GET TRAINER DETAIL
export const fetchTrainerDetail = async (publicId) => {
  return await getTrainerById(pool, publicId);
};

// UPDATE TRAINER
const ALLOWED_TRAINER_STATUSES = ['active', 'inactive'];

export const editTrainer = async (publicId, data, actor) => {
  const { trainer_full_name, contact_number, handles_tesda, handles_shs, tesda_course_ids, shs_course_ids, status } = data;

  if (!trainer_full_name || !trainer_full_name.trim()) {
    throw new Error('Trainer name is required.');
  }
  if (!contact_number || !contact_number.trim()) {
    throw new Error('Contact number is required.');
  }
  if (!PHONE_REGEX.test(contact_number.trim())) {
    throw new Error('Contact number must start with 09 and be 11 digits long.');
  }

  const emailTrimmed = data.email?.trim() || null;
  if (emailTrimmed && !EMAIL_REGEX.test(emailTrimmed)) {
    throw new Error('Please enter a valid email address.');
  }

  validateProgramTypeSelection(!!handles_tesda, !!handles_shs, tesda_course_ids, shs_course_ids);

  if (status && !ALLOWED_TRAINER_STATUSES.includes(status.toLowerCase())) {
    throw new Error(`Invalid status: ${status}`);
  }

  const normalizedStatus = (status || 'active').toLowerCase();

  // => Fetch the current row to detect an actual status change - remarks
  //    are only required when Active/Inactive is actually being flipped,
  //    not on every routine name/contact/course edit
  const existing = await getTrainerById(pool, publicId);
  if (!existing) throw new Error('Trainer not found.');

  const isStatusChange = existing.status.toLowerCase() !== normalizedStatus;
  const remarksTrimmed = data.remarks?.trim() || null;

  if (isStatusChange && !remarksTrimmed) {
    throw new Error('Remarks are required when changing the trainer status.');
  }

  const updated = await updateTrainerWithCourses(pool, publicId, {
    trainer_full_name: trainer_full_name.trim(),
    contact_number: contact_number.trim(),
    email: emailTrimmed,
    // => Normalize to lowercase before it ever hits the DB - same fix as
    //    Facilities, prevents a mismatched-casing status from ever landing
    status: normalizedStatus,
    handles_tesda: !!handles_tesda,
    handles_shs: !!handles_shs,
    tesda_course_ids: tesda_course_ids || [],
    shs_course_ids: shs_course_ids || [],
    // => Only pass remarks through on an actual status change - otherwise
    //    null, so updateTrainerWithCourses' COALESCE leaves the existing
    //    remarks value untouched
    remarks: isStatusChange ? remarksTrimmed : null,
    updated_by: actor?.admin_id || null,
  });

  // => Builds a real old -> new diff for the action_detail instead of a
  //    flat "Updated details..." string - same buildFieldDiff/
  //    formatDiffDetail pattern used on Facilities. A status change keeps
  //    its own distinct message, since STATUS_CHANGE is a different
  //    action type from a routine field UPDATE.
  let actionDetail;
  if (isStatusChange) {
    actionDetail = `Status changed from "${existing.status}" to "${normalizedStatus}". Reason: ${remarksTrimmed}`;
  } else {
    const scalarChanges = buildFieldDiff(existing, {
      trainer_full_name: trainer_full_name.trim(),
      contact_number: contact_number.trim(),
      email: emailTrimmed,
    }, {
      trainer_full_name: 'Full Name',
      contact_number: 'Contact Number',
      email: 'Email',
    });

    const extraChanges = [];

    // => handles_tesda/handles_shs are booleans - buildFieldDiff's generic
    //    normalize() would print raw "true"/"false", so these are built
    //    manually for readable Yes/No lines instead
    if (!!existing.handles_tesda !== !!handles_tesda) {
      extraChanges.push(
        `Handles TESDA Courses: "${existing.handles_tesda ? 'Yes' : 'No'}" => "${handles_tesda ? 'Yes' : 'No'}"`
      );
    }
    if (!!existing.handles_shs !== !!handles_shs) {
      extraChanges.push(
        `Handles SHS Courses: "${existing.handles_shs ? 'Yes' : 'No'}" => "${handles_shs ? 'Yes' : 'No'}"`
      );
    }

    // => Course assignments only matter while their program type is
    //    enabled - mirrors updateTrainerWithCourses' own logic, where a
    //    handles_tesda=false save wipes trainer_tesda_courses regardless
    //    of what was submitted in the array
    const effectiveNewTesdaIds = handles_tesda ? (tesda_course_ids || []) : [];
    const effectiveNewShsIds = handles_shs ? (shs_course_ids || []) : [];

    const [oldTesdaTitles, newTesdaTitles, oldShsTitles, newShsTitles] = await Promise.all([
      getTesdaCourseTitlesByIds(pool, existing.tesda_course_ids),
      getTesdaCourseTitlesByIds(pool, effectiveNewTesdaIds),
      getShsCourseTitlesByIds(pool, existing.shs_course_ids),
      getShsCourseTitlesByIds(pool, effectiveNewShsIds),
    ]);

    const oldTesdaStr = oldTesdaTitles.slice().sort().join(', ') || 'None';
    const newTesdaStr = newTesdaTitles.slice().sort().join(', ') || 'None';
    if (oldTesdaStr !== newTesdaStr) {
      extraChanges.push(`Assigned TESDA Courses: "${oldTesdaStr}" => "${newTesdaStr}"`);
    }

    const oldShsStr = oldShsTitles.slice().sort().join(', ') || 'None';
    const newShsStr = newShsTitles.slice().sort().join(', ') || 'None';
    if (oldShsStr !== newShsStr) {
      extraChanges.push(`Assigned SHS Courses: "${oldShsStr}" => "${newShsStr}"`);
    }

    actionDetail = formatDiffDetail('Trainer Details', [...scalarChanges, ...extraChanges]);
  }

  // => Logs every save, not just status changes - the action label
  //    differs depending on whether this particular save changed the status
  await logActivity(pool, {
    entity_type: 'trainer',
    entity_id: updated.trainer_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: isStatusChange ? ACTIVITY_ACTIONS.STATUS_CHANGE : ACTIVITY_ACTIONS.UPDATE,
    action_detail: actionDetail,
  });

  return updated;
};

// SOFT-DELETE TRAINER
// => remarks are always required here - deletion has no "no change" case
//    the way an edit does, so there's nothing to COALESCE against
export const deleteTrainer = async (publicId, remarks, actor) => {
  const remarksTrimmed = remarks?.trim() || null;
  if (!remarksTrimmed) {
    throw new Error('Remarks are required when deleting a trainer.');
  }
  const deleted = await softDeleteTrainer(pool, publicId, remarksTrimmed);

  if (deleted) {
    await logActivity(pool, {
      entity_type: 'trainer',
      entity_id: deleted.trainer_id,
      actor_type: 'Staff',
      actor_id: actor?.admin_id,
      actor_name: actor?.full_name,
      action: ACTIVITY_ACTIONS.SOFT_DELETE,
      action_detail: `Deleted trainer "${deleted.trainer_full_name}". Reason: ${remarksTrimmed}`,
    });
  }

  return deleted;
};

// RESTORE TRAINER
export const restoreTrainerService = async (publicId, actor) => {
  const restored = await restoreTrainer(pool, publicId);

  if (restored) {
    await logActivity(pool, {
      entity_type: 'trainer',
      entity_id: restored.trainer_id,
      actor_type: 'Staff',
      actor_id: actor?.admin_id,
      actor_name: actor?.full_name,
      action: ACTIVITY_ACTIONS.RESTORE,
      action_detail: `Restored trainer "${restored.trainer_full_name}".`,
    });
  }

  return restored;
};

// GET TRAINER ACTIVITY LOGS
// => Resolves public_id to the internal trainer_id first, then reuses the
//    generic getActivityLogsForEntity helper - matches Facilities' and the
//    Batches' fetchLogs pattern (fetch everything, no pagination).
export const fetchTrainerLogs = async (publicId) => {
  const trainerId = await getTrainerIdByPublicId(pool, publicId);
  if (!trainerId) return null;
  return await getActivityLogsForEntity(pool, 'trainer', trainerId);
};
