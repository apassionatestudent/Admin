// => services/shsCourseService.js

import * as ShsCourseModel from '../../models/Courses/shsCourseModel.js';
import * as SectorClusterModel from '../../models/Courses/sectorClusterModel.js';
import { pool } from '../../config/db.js';
import { logActivity, getActivityLogsForEntity } from '../../models/adminActivityLogModel.js';
import { ACTIVITY_ACTIONS } from '../../constants/activityActions.js';
import { buildFieldDiff, formatDiffDetail } from '../../utils/buildFieldDiff.js';

// => Friendly labels for the Course Information diff, shown in the Activity Log
const SHS_COURSE_INFO_LABELS = {
  title: 'Title',
  description: 'Description',
  cluster_id: 'Cluster',
  grade_level: 'Grade Level',
  course_link: 'Course Link',
};

// => Same PATCH endpoint covers both the Course Information section save
// => AND the status toggle button, so this checks which one actually
// => happened rather than assuming - mirrors tesdaCourseService.js
function buildShsCourseLogEntry(existingCourse, fields) {
  if (fields.status !== undefined && fields.status !== existingCourse.status) {
    return {
      action: ACTIVITY_ACTIONS.STATUS_CHANGE,
      action_detail: `Status changed from "${existingCourse.status}" to "${fields.status}"`,
    };
  }

  const changes = buildFieldDiff(existingCourse, fields, SHS_COURSE_INFO_LABELS);
  return {
    action: ACTIVITY_ACTIONS.UPDATE,
    action_detail: formatDiffDetail('Course Information', changes),
  };
}

export async function listShsCourses() {
  return ShsCourseModel.findAllShsCourses();
}

export async function getShsCourseDetail(adminUuid) {
  const course = await ShsCourseModel.findShsCourseByAdminUuid(adminUuid);
  if (!course) return null;

  const jobOpportunities = await ShsCourseModel.findJobOpportunitiesByCourseId(course.course_id);
  // => Publish/public-link feature removed - the public site doesn't gate on
  // => it, so this join was dead weight on every detail-page load
  return { ...course, jobOpportunities };
}

export async function createShsCourse({ course, jobOpportunities, actor }) {
  const required = ['title', 'cluster_id', 'grade_level'];
  const missing = required.filter((field) => !course?.[field]);

  if (missing.length > 0) {
    const error = new Error(`Missing required fields: ${missing.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }

  const newCourse = await ShsCourseModel.insertShsCourseWithJobOpportunities({
    course, jobOpportunities, adminId: actor?.admin_id,
  });

  await logActivity(pool, {
    entity_type: 'shs_course',
    entity_id: newCourse.course_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.CREATE,
    action_detail: `Created SHS course "${newCourse.title}"`,
  });

  return newCourse;
}

export async function updateShsCourse(adminUuid, fields, actor) {
  // => Fetched before the write so the diff / status-change check below has
  // => something to compare against
  const existingCourse = await ShsCourseModel.findShsCourseByAdminUuid(adminUuid);
  if (!existingCourse) {
    const error = new Error('Course not found or no valid fields to update');
    error.statusCode = 404;
    throw error;
  }

  // => Reactivation guard - if this request is trying to flip status to
  // => 'active', block it when the course's cluster is currently soft-deleted.
  // => Uses fields.cluster_id if it's also being changed in this same
  // => request, otherwise falls back to the course's existing cluster_id.
  if (fields.status === 'active' && existingCourse.status !== 'active') {
    const effectiveClusterId = fields.cluster_id !== undefined ? fields.cluster_id : existingCourse.cluster_id;
    const clusterIsDeleted = await SectorClusterModel.isClusterDeleted(effectiveClusterId);
    if (clusterIsDeleted) {
      const error = new Error(
        'Cannot activate this course - its cluster has been deleted. Restore the cluster first, or assign a different one.'
      );
      error.statusCode = 409;
      throw error;
    }
  }

  const updated = await ShsCourseModel.updateShsCourse(adminUuid, fields);
  if (!updated) {
    const error = new Error('Course not found or no valid fields to update');
    error.statusCode = 404;
    throw error;
  }

  const { action, action_detail } = buildShsCourseLogEntry(existingCourse, fields);
  await logActivity(pool, {
    entity_type: 'shs_course',
    entity_id: updated.course_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action,
    action_detail,
  });

  return updated;
}

export async function deleteShsCourse(adminUuid, actor) {
  const deleted = await ShsCourseModel.softDeleteShsCourse(adminUuid);
  if (!deleted) {
    const error = new Error('Course not found or already deleted');
    error.statusCode = 404;
    throw error;
  }

  await logActivity(pool, {
    entity_type: 'shs_course',
    entity_id: deleted.course_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.SOFT_DELETE,
    action_detail: 'Course deleted (archived)',
  });

  return deleted;
}

export async function listDeletedShsCourses() {
  return ShsCourseModel.findAllDeletedShsCourses();
}

export async function restoreShsCourse(adminUuid, actor) {
  const restored = await ShsCourseModel.restoreShsCourse(adminUuid);
  if (!restored) {
    const error = new Error('Course not found or is not currently deleted');
    error.statusCode = 404;
    throw error;
  }

  await logActivity(pool, {
    entity_type: 'shs_course',
    entity_id: restored.course_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.RESTORE,
    action_detail: 'Course restored from archive',
  });

  return restored;
}

// => Publish/public-link feature removed (enablePublicLink, updatePublicLink,
// => generateUniqueSlug) - status alone now governs visibility, the separate
// => publish gate was redundant with what the public site actually checks.
// => shs_course_public_links stays in Neon, unused, not dropped.

// => Job opportunities sub-resource - same pattern as tesdaCourseService.js

export async function addJobOpportunity(adminUuid, jobTitle, actor) {
  if (!jobTitle) {
    const error = new Error('Job title is required');
    error.statusCode = 400;
    throw error;
  }
  const newRow = await ShsCourseModel.insertSingleJobOpportunity(adminUuid, jobTitle);
  if (!newRow) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    throw error;
  }

  await logActivity(pool, {
    entity_type: 'shs_course',
    entity_id: newRow.course_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.UPDATE,
    action_detail: `Added job opportunity: "${newRow.job_title}"`,
  });

  return newRow;
}

export async function editJobOpportunity(jobId, jobTitle, actor) {
  if (!jobTitle) {
    const error = new Error('Job title is required');
    error.statusCode = 400;
    throw error;
  }
  const updated = await ShsCourseModel.updateJobOpportunity(jobId, jobTitle);
  if (!updated) {
    const error = new Error('Job opportunity not found');
    error.statusCode = 404;
    throw error;
  }

  await logActivity(pool, {
    entity_type: 'shs_course',
    entity_id: updated.course_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.UPDATE,
    action_detail: `Updated job opportunity to "${updated.job_title}"`,
  });

  return updated;
}

export async function removeJobOpportunity(jobId, actor) {
  const deleted = await ShsCourseModel.deleteJobOpportunity(jobId);
  if (!deleted) {
    const error = new Error('Job opportunity not found');
    error.statusCode = 404;
    throw error;
  }

  await logActivity(pool, {
    entity_type: 'shs_course',
    entity_id: deleted.course_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.UPDATE,
    action_detail: `Removed job opportunity (id: ${deleted.id})`,
  });

  return deleted;
}

// => Non-paginated fetch for the detail page's Activity Log section
export async function getShsCourseLogs(adminUuid) {
  const course = await ShsCourseModel.findShsCourseByAdminUuid(adminUuid);
  if (!course) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    throw error;
  }
  return getActivityLogsForEntity(pool, 'shs_course', course.course_id);
}
