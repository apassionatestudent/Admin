// => services/Classes/adminFacilityService.js
// => Validation + orchestration layer - controller stays req/res-only,
//    model stays pure SQL, business rules live here.

import { pool } from '../../config/db.js';
import {
  getActiveFacilities,
  getDeletedFacilities,
  createFacilityWithCourses,
  getFacilityById,
  updateFacilityWithCourses,
  softDeleteFacility,
  restoreFacility,
} from '../../models/Classes/adminFacilityModel.js';
import { logActivity } from '../../models/adminActivityLogModel.js';

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
    actor_type: 'Admin',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: 'Facility Created',
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

  // => Logs every save, not just status changes, per standing audit
  //    requirement - the action label and detail differ depending on
  //    whether this particular save happened to change the status
  await logActivity(pool, {
    entity_type: 'facility',
    entity_id: updated.facility_id,
    actor_type: 'Admin',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: isStatusChange ? 'Status Change' : 'Facility Updated',
    action_detail: isStatusChange
      ? `Status changed from "${existing.status}" to "${normalizedStatus}". Reason: ${remarksTrimmed}`
      : `Updated details for facility "${updated.name}".`,
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
      actor_type: 'Admin',
      actor_id: actor?.admin_id,
      actor_name: actor?.full_name,
      action: 'Facility Deleted',
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
      actor_type: 'Admin',
      actor_id: actor?.admin_id,
      actor_name: actor?.full_name,
      action: 'Facility Restored',
      action_detail: `Restored facility "${restored.name}".`,
    });
  }

  return restored;
};
