// => services/Classes/adminFacilityService.js
// => Validation + orchestration layer - controller stays req/res-only,
//    model stays pure SQL, business rules live here.

import { pool } from '../../config/db.js';
import {
  getActiveFacilities,
  getDeletedFacilities,
  createFacilityWithCourses,
  getFacilityById,
  getFacilityIdByPublicId,
  updateFacilityWithCourses,
  softDeleteFacility,
  restoreFacility,
  getTesdaCourseTitlesByIds,
  getShsCourseTitlesByIds,
} from '../../models/Classes/adminFacilityModel.js';
// => Non-paginated fetch, matches the Batches pattern - one facility won't
//    accumulate enough log rows to need pagination the way the Logs page
//    or the facility session calendar does
import { logActivity, getActivityLogsForEntity } from '../../models/adminActivityLogModel.js';
// => Canonical action taxonomy - replaces the free-text action strings below,
//    which were silently failing logActivity's INSERT against the
//    activity_logs_action_check constraint (same bug pattern found in
//    Class Sessions and Batches)
import { ACTIVITY_ACTIONS } from '../../constants/activityActions.js';
// => Real old -> new diff builder, same pattern already used on
//    Enrollments and Batches - replaces the flat "Updated details..."
//    string with actual field-level changes
import { buildFieldDiff, formatDiffDetail } from '../../utils/buildFieldDiff.js';

// GET ACTIVE FACILITIES
export const fetchActiveFacilities = async () => {
  return await getActiveFacilities(pool);
};

// GET DELETED FACILITIES
export const fetchDeletedFacilities = async () => {
  return await getDeletedFacilities(pool);
};

// CREATE FACILITY
export const addFacility = async (data, actor) => {
  const { name, allows_all_courses, tesda_course_ids, shs_course_ids } = data;

  if (!name || !name.trim()) throw new Error('Facility name is required.');

  const hasAnySelection = (tesda_course_ids?.length || 0) + (shs_course_ids?.length || 0) > 0;
  if (!allows_all_courses && !hasAnySelection) {
    throw new Error('Select at least one TESDA course or SHS course, or mark this facility as allowing all courses.');
  }

  const created = await createFacilityWithCourses(pool, {
    name: name.trim(),
    capacity: data.capacity || null,
    allows_all_courses: !!allows_all_courses,
    tesda_course_ids: tesda_course_ids || [],
    shs_course_ids: shs_course_ids || [],
    created_by: data.created_by,
    // => Optional on creation - nothing to explain yet on a brand new facility
    remarks: data.remarks?.trim() || null,
  });

  await logActivity(pool, {
    entity_type: 'facility',
    entity_id: created.facility_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.CREATE,
    action_detail: `Created facility "${created.name}".`,
  });

  return created;
};

// GET FACILITY DETAIL
export const fetchFacilityDetail = async (publicId) => {
  return await getFacilityById(pool, publicId);
};

// UPDATE FACILITY
const ALLOWED_FACILITY_STATUSES = ['active', 'inactive'];

export const editFacility = async (publicId, data, actor) => {
  const { name, allows_all_courses, tesda_course_ids, shs_course_ids, status } = data;

  if (!name || !name.trim()) throw new Error('Facility name is required.');

  const hasAnySelection = (tesda_course_ids?.length || 0) + (shs_course_ids?.length || 0) > 0;
  if (!allows_all_courses && !hasAnySelection) {
    throw new Error('Select at least one TESDA course or SHS course, or mark this facility as allowing all courses.');
  }

  if (status && !ALLOWED_FACILITY_STATUSES.includes(status.toLowerCase())) {
    throw new Error(`Invalid status: ${status}`);
  }

  const normalizedStatus = (status || 'active').toLowerCase();

  // => Fetch the current row to detect an actual status change - remarks
  //    are only required when Active/Inactive is actually being flipped,
  //    not on every routine name/capacity/course edit
  const existing = await getFacilityById(pool, publicId);
  if (!existing) throw new Error('Facility not found.');

  const isStatusChange = existing.status.toLowerCase() !== normalizedStatus;
  const remarksTrimmed = data.remarks?.trim() || null;

  if (isStatusChange && !remarksTrimmed) {
    throw new Error('Remarks are required when changing the facility status.');
  }

  const updated = await updateFacilityWithCourses(pool, publicId, {
    name: name.trim(),
    capacity: data.capacity || null,
    allows_all_courses: !!allows_all_courses,
    // => Normalize to lowercase before it ever hits the DB - this is the
    //    fix for the casing bug from earlier (some existing row had
    //    'Active' instead of 'active'). Every future write goes through here.
    status: normalizedStatus,
    tesda_course_ids: tesda_course_ids || [],
    shs_course_ids: shs_course_ids || [],
    // => Only pass remarks through on an actual status change - otherwise
    //    null, so updateFacilityWithCourses' COALESCE leaves the existing
    //    remarks value untouched
    remarks: isStatusChange ? remarksTrimmed : null,
    updated_by: actor?.admin_id || null,
  });

  // => Builds a real old -> new diff for the action_detail instead of the
  //    flat "Updated details..." string - same buildFieldDiff/
  //    formatDiffDetail pattern already used on Enrollments and Batches.
  //    A status change keeps its own distinct message, since STATUS_CHANGE
  //    is a different action type from a routine field UPDATE.
  let actionDetail;
  if (isStatusChange) {
    actionDetail = `Status changed from "${existing.status}" to "${normalizedStatus}". Reason: ${remarksTrimmed}`;
  } else {
    const scalarChanges = buildFieldDiff(existing, {
      name: name.trim(),
      capacity: data.capacity || null,
    }, {
      name: 'Facility Name',
      capacity: 'Capacity',
    });

    const extraChanges = [];

    // => allows_all_courses is a boolean - buildFieldDiff's generic
    //    normalize() would print raw "true"/"false", so this one is
    //    built manually for a readable Yes/No line instead
    if (!!existing.allows_all_courses !== !!allows_all_courses) {
      extraChanges.push(
        `General Facility: "${existing.allows_all_courses ? 'Yes' : 'No'}" => "${allows_all_courses ? 'Yes' : 'No'}"`
      );
    }

    // => Course/cluster restrictions only matter while NOT general -
    //    mirrors updateFacilityWithCourses' own logic, where an
    //    allows_all_courses=true save wipes the join rows regardless of
    //    what was actually submitted in the arrays
    const effectiveNewTesdaIds = allows_all_courses ? [] : (tesda_course_ids || []);
    const effectiveNewShsIds = allows_all_courses ? [] : (shs_course_ids || []);

    const [oldTesdaTitles, newTesdaTitles, oldShsTitles, newShsTitles] = await Promise.all([
      getTesdaCourseTitlesByIds(pool, existing.tesda_course_ids),
      getTesdaCourseTitlesByIds(pool, effectiveNewTesdaIds),
      getShsCourseTitlesByIds(pool, existing.shs_course_ids),
      getShsCourseTitlesByIds(pool, effectiveNewShsIds),
    ]);

    const oldTesdaStr = oldTesdaTitles.slice().sort().join(', ') || 'None';
    const newTesdaStr = newTesdaTitles.slice().sort().join(', ') || 'None';
    if (oldTesdaStr !== newTesdaStr) {
      extraChanges.push(`Allowed TESDA Courses: "${oldTesdaStr}" => "${newTesdaStr}"`);
    }

    const oldShsStr = oldShsTitles.slice().sort().join(', ') || 'None';
    const newShsStr = newShsTitles.slice().sort().join(', ') || 'None';
    if (oldShsStr !== newShsStr) {
      extraChanges.push(`Allowed SHS Courses: "${oldShsStr}" => "${newShsStr}"`);
    }

    actionDetail = formatDiffDetail('Facility Details', [...scalarChanges, ...extraChanges]);
  }

  // => Logs every save, not just status changes - the action label
  //    differs depending on whether this particular save changed the status
  await logActivity(pool, {
    entity_type: 'facility',
    entity_id: updated.facility_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: isStatusChange ? ACTIVITY_ACTIONS.STATUS_CHANGE : ACTIVITY_ACTIONS.UPDATE,
    action_detail: actionDetail,
  });

  return updated;
};

// SOFT-DELETE FACILITY
// => remarks are always required here - deletion has no "no change" case
//    the way an edit does, so there's nothing to COALESCE against
export const deleteFacility = async (publicId, remarks, actor) => {
  const remarksTrimmed = remarks?.trim() || null;
  if (!remarksTrimmed) {
    throw new Error('Remarks are required when deleting a facility.');
  }
  const deleted = await softDeleteFacility(pool, publicId, remarksTrimmed);

  if (deleted) {
    await logActivity(pool, {
      entity_type: 'facility',
      entity_id: deleted.facility_id,
      actor_type: 'Staff',
      actor_id: actor?.admin_id,
      actor_name: actor?.full_name,
      action: ACTIVITY_ACTIONS.SOFT_DELETE,
      action_detail: `Deleted facility "${deleted.name}". Reason: ${remarksTrimmed}`,
    });
  }

  return deleted;
};

// RESTORE FACILITY
export const restoreFacilityService = async (publicId, actor) => {
  const restored = await restoreFacility(pool, publicId);

  if (restored) {
    await logActivity(pool, {
      entity_type: 'facility',
      entity_id: restored.facility_id,
      actor_type: 'Staff',
      actor_id: actor?.admin_id,
      actor_name: actor?.full_name,
      action: ACTIVITY_ACTIONS.RESTORE,
      action_detail: `Restored facility "${restored.name}".`,
    });
  }

  return restored;
};

// GET FACILITY ACTIVITY LOGS
// => Resolves public_id to the internal facility_id first, then reuses the
//    generic getActivityLogsForEntity helper - matches TesdaBatchDetail /
//    ShsBatchDetail's fetchLogs pattern (fetch everything, no pagination).
export const fetchFacilityLogs = async (publicId) => {
  const facilityId = await getFacilityIdByPublicId(pool, publicId);
  if (!facilityId) return null;
  return await getActivityLogsForEntity(pool, 'facility', facilityId);
};