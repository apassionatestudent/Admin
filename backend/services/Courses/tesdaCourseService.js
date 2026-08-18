// => services/tesdaCourseService.js
// => Business rules / validation live here so the model stays pure persistence
// => and the controller stays thin req/res handling.

import * as TesdaCourseModel from '../../models/Courses/tesdaCourseModel.js';
import * as SectorClusterModel from '../../models/Courses/sectorClusterModel.js';
import { pool } from '../../config/db.js';
import { logActivity, getActivityLogsForEntity } from '../../models/adminActivityLogModel.js';
import { ACTIVITY_ACTIONS } from '../../constants/activityActions.js';
import { buildFieldDiff, formatDiffDetail } from '../../utils/buildFieldDiff.js';

// => Friendly labels for the Course Information diff, shown in the Activity Log
const TESDA_COURSE_INFO_LABELS = {
  title: 'Title',
  description: 'Description',
  accreditation_no: 'Accreditation No.',
  date_accredited: 'Date Accredited',
  expiration_date: 'Expiration Date',
  sector_id: 'Sector',
  certification_id: 'National Certification Level',
  amount: 'Fee',
  hours: 'Training Hours',
};

// => Same PATCH endpoint on the detail page covers both the Course
// => Information section save AND the status toggle button, so this checks
// => which one actually happened rather than assuming - mirrors the
// => Support Tickets STATUS_CHANGE vs UPDATE split
function buildTesdaCourseLogEntry(existingCourse, fields) {
  if (fields.status !== undefined && fields.status !== existingCourse.status) {
    return {
      action: ACTIVITY_ACTIONS.STATUS_CHANGE,
      action_detail: `Status changed from "${existingCourse.status}" to "${fields.status}"`,
    };
  }

  const changes = buildFieldDiff(existingCourse, fields, TESDA_COURSE_INFO_LABELS);
  return {
    action: ACTIVITY_ACTIONS.UPDATE,
    action_detail: formatDiffDetail('Course Information', changes),
  };
}

// => Title must never contain the NC level itself (e.g. "...NCII") - that's
// => stored separately in certification_id and concatenated for display, so
// => baking it into the title text would show it twice ("X NCII NCII").
// => Matches "NC I".."NC IV" and "NCI".."NCIV", case-insensitive, as a whole word.
const NC_LEVEL_PATTERN = /\bNC\s?I{1,3}V?\b/i;

function assertTitleHasNoNcLevel(title) {
  if (title && NC_LEVEL_PATTERN.test(title)) {
    const error = new Error(
      'Title should not include the National Certification level (e.g. "NCII") - select it from the dropdown instead.'
    );
    error.statusCode = 400;
    throw error;
  }
}

export async function listTesdaCourses() {
  return TesdaCourseModel.findAllTesdaCourses();
}

export async function listCertificationTypes() {
  return TesdaCourseModel.findAllCertificationTypes();
}

export async function getTesdaCourseDetail(adminUuid) {
  const course = await TesdaCourseModel.findTesdaCourseByAdminUuid(adminUuid);
  if (!course) return null;

  // => Competency tables and job opportunities FK against the internal
  // => course_id, not admin_uuid - course.course_id here is the internal id
  // => pulled off the row we just found
  const competencies = await TesdaCourseModel.findCompetenciesByCourseId(course.course_id);
  const jobOpportunities = await TesdaCourseModel.findJobOpportunitiesByCourseId(course.course_id);
  // => Publish/public-link feature removed - the public site doesn't gate on
  // => it, so this join was dead weight on every detail-page load
  return { ...course, competencies, jobOpportunities };
}

export async function createTesdaCourse({ course, competencies, jobOpportunities, actor }) {
  const required = ['title', 'accreditation_no', 'date_accredited', 'expiration_date', 'hours', 'certification_id'];
  const missing = required.filter((field) => !course?.[field]);

  if (missing.length > 0) {
    const error = new Error(`Missing required fields: ${missing.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }

  assertTitleHasNoNcLevel(course.title);

  const newCourse = await TesdaCourseModel.insertTesdaCourseWithCompetencies({
    course, competencies, jobOpportunities, adminId: actor?.admin_id,
  });

  await logActivity(pool, {
    entity_type: 'tesda_course',
    entity_id: newCourse.course_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.CREATE,
    action_detail: `Created TESDA course "${newCourse.title}"`,
  });

  return newCourse;
}

export async function updateTesdaCourse(adminUuid, fields, actor) {
  if (fields?.title !== undefined) {
    assertTitleHasNoNcLevel(fields.title);
  }

  // => Fetched before the write so the diff / status-change check below has
  // => something to compare against
  const existingCourse = await TesdaCourseModel.findTesdaCourseByAdminUuid(adminUuid);
  if (!existingCourse) {
    const error = new Error('Course not found or no valid fields to update');
    error.statusCode = 404;
    throw error;
  }

  // => Reactivation guard - if this request is trying to flip status to
  // => 'active', block it when the course's sector is currently soft-deleted.
  // => Uses fields.sector_id if it's also being changed in this same
  // => request, otherwise falls back to the course's existing sector_id.
  if (fields.status === 'active' && existingCourse.status !== 'active') {
    const effectiveSectorId = fields.sector_id !== undefined ? fields.sector_id : existingCourse.sector_id;
    const sectorIsDeleted = await SectorClusterModel.isSectorDeleted(effectiveSectorId);
    if (sectorIsDeleted) {
      const error = new Error(
        'Cannot activate this course - its sector has been deleted. Restore the sector first, or assign a different one.'
      );
      error.statusCode = 409;
      throw error;
    }
  }

  const updated = await TesdaCourseModel.updateTesdaCourse(adminUuid, fields);
  if (!updated) {
    const error = new Error('Course not found or no valid fields to update');
    error.statusCode = 404;
    throw error;
  }

  const { action, action_detail } = buildTesdaCourseLogEntry(existingCourse, fields);
  await logActivity(pool, {
    entity_type: 'tesda_course',
    entity_id: updated.course_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action,
    action_detail,
  });

  return updated;
}

export async function deleteTesdaCourse(adminUuid, actor) {
  const deleted = await TesdaCourseModel.softDeleteTesdaCourse(adminUuid);
  if (!deleted) {
    const error = new Error('Course not found or already deleted');
    error.statusCode = 404;
    throw error;
  }

  await logActivity(pool, {
    entity_type: 'tesda_course',
    entity_id: deleted.course_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.SOFT_DELETE,
    action_detail: 'Course deleted (archived)',
  });

  return deleted;
}

export async function listDeletedTesdaCourses() {
  return TesdaCourseModel.findAllDeletedTesdaCourses();
}

export async function restoreTesdaCourse(adminUuid, actor) {
  const restored = await TesdaCourseModel.restoreTesdaCourse(adminUuid);
  if (!restored) {
    const error = new Error('Course not found or is not currently deleted');
    error.statusCode = 404;
    throw error;
  }

  await logActivity(pool, {
    entity_type: 'tesda_course',
    entity_id: restored.course_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.RESTORE,
    action_detail: 'Course restored from archive',
  });

  return restored;
}

const VALID_COMPETENCY_TYPES = ['basic', 'common', 'core'];

export async function addCompetency(adminUuid, type, data, actor) {
  if (!VALID_COMPETENCY_TYPES.includes(type)) {
    const error = new Error('Invalid competency type');
    error.statusCode = 400;
    throw error;
  }
  if (!data?.code || !data?.competency) {
    const error = new Error('Competency code and description are required');
    error.statusCode = 400;
    throw error;
  }
  const newRow = await TesdaCourseModel.insertSingleCompetency(adminUuid, type, data);
  if (!newRow) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    throw error;
  }

  await logActivity(pool, {
    entity_type: 'tesda_course',
    entity_id: newRow.course_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.UPDATE,
    action_detail: `Added ${type} competency: "${newRow.code}" - "${newRow.competency}"`,
  });

  return newRow;
}

export async function editCompetency(type, competencyId, data, actor) {
  if (!VALID_COMPETENCY_TYPES.includes(type)) {
    const error = new Error('Invalid competency type');
    error.statusCode = 400;
    throw error;
  }
  const updated = await TesdaCourseModel.updateCompetency(type, competencyId, data);
  if (!updated) {
    const error = new Error('Competency not found');
    error.statusCode = 404;
    throw error;
  }

  await logActivity(pool, {
    entity_type: 'tesda_course',
    entity_id: updated.course_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.UPDATE,
    action_detail: `Updated ${type} competency: "${updated.code}" - "${updated.competency}"`,
  });

  return updated;
}

export async function removeCompetency(type, competencyId, actor) {
  if (!VALID_COMPETENCY_TYPES.includes(type)) {
    const error = new Error('Invalid competency type');
    error.statusCode = 400;
    throw error;
  }
  const deleted = await TesdaCourseModel.deleteCompetency(type, competencyId);
  if (!deleted) {
    const error = new Error('Competency not found');
    error.statusCode = 404;
    throw error;
  }

  await logActivity(pool, {
    entity_type: 'tesda_course',
    entity_id: deleted.course_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.UPDATE,
    action_detail: `Removed ${type} competency (id: ${deleted.id})`,
  });

  return deleted;
}

// => Publish/public-link feature removed (enablePublicLink, updatePublicLink,
// => generateUniqueSlug) - status alone now governs visibility, the separate
// => publish gate was redundant with what the public site actually checks.
// => tesda_course_public_links stays in Neon, unused, not dropped.

// => Job opportunities sub-resource - same validate-then-delegate pattern as competencies

export async function addJobOpportunity(adminUuid, jobTitle, actor) {
  if (!jobTitle) {
    const error = new Error('Job title is required');
    error.statusCode = 400;
    throw error;
  }
  const newRow = await TesdaCourseModel.insertSingleJobOpportunity(adminUuid, jobTitle);
  if (!newRow) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    throw error;
  }

  await logActivity(pool, {
    entity_type: 'tesda_course',
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
  const updated = await TesdaCourseModel.updateJobOpportunity(jobId, jobTitle);
  if (!updated) {
    const error = new Error('Job opportunity not found');
    error.statusCode = 404;
    throw error;
  }

  await logActivity(pool, {
    entity_type: 'tesda_course',
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
  const deleted = await TesdaCourseModel.deleteJobOpportunity(jobId);
  if (!deleted) {
    const error = new Error('Job opportunity not found');
    error.statusCode = 404;
    throw error;
  }

  await logActivity(pool, {
    entity_type: 'tesda_course',
    entity_id: deleted.course_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.UPDATE,
    action_detail: `Removed job opportunity (id: ${deleted.id})`,
  });

  return deleted;
}

// => Non-paginated fetch for the detail page's Activity Log section -
// => resolves admin_uuid to the internal course_id first, same pattern as
// => every other course-scoped read
export async function getTesdaCourseLogs(adminUuid) {
  const course = await TesdaCourseModel.findTesdaCourseByAdminUuid(adminUuid);
  if (!course) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    throw error;
  }
  return getActivityLogsForEntity(pool, 'tesda_course', course.course_id);
}
