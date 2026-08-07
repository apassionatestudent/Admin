// => services/tesdaCourseService.js
// => Business rules / validation live here so the model stays pure persistence
// => and the controller stays thin req/res handling.

import * as TesdaCourseModel from '../../models/Courses/tesdaCourseModel.js';
import { slugify } from '../../utils/slugify.js';

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

  // => Competency tables, job opportunities, and the public link all FK
  // => against the internal course_id, not admin_uuid - course.course_id
  // => here is the internal id pulled off the row we just found
  const competencies = await TesdaCourseModel.findCompetenciesByCourseId(course.course_id);
  const jobOpportunities = await TesdaCourseModel.findJobOpportunitiesByCourseId(course.course_id);
  const publicLink = await TesdaCourseModel.findPublicLinkByCourseId(course.course_id);
  return { ...course, competencies, jobOpportunities, publicLink };
}

export async function createTesdaCourse({ course, competencies, jobOpportunities, adminId }) {
  const required = ['title', 'accreditation_no', 'date_accredited', 'expiration_date', 'hours', 'certification_id'];
  const missing = required.filter((field) => !course?.[field]);

  if (missing.length > 0) {
    const error = new Error(`Missing required fields: ${missing.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }

  assertTitleHasNoNcLevel(course.title);

  return TesdaCourseModel.insertTesdaCourseWithCompetencies({ course, competencies, jobOpportunities, adminId });
}

export async function updateTesdaCourse(adminUuid, fields) {
  if (fields?.title !== undefined) {
    assertTitleHasNoNcLevel(fields.title);
  }

  const updated = await TesdaCourseModel.updateTesdaCourse(adminUuid, fields);
  if (!updated) {
    const error = new Error('Course not found or no valid fields to update');
    error.statusCode = 404;
    throw error;
  }
  return updated;
}

export async function deleteTesdaCourse(adminUuid) {
  const deleted = await TesdaCourseModel.softDeleteTesdaCourse(adminUuid);
  if (!deleted) {
    const error = new Error('Course not found or already deleted');
    error.statusCode = 404;
    throw error;
  }
  return deleted;
}

export async function listDeletedTesdaCourses() {
  return TesdaCourseModel.findAllDeletedTesdaCourses();
}

export async function restoreTesdaCourse(adminUuid) {
  const restored = await TesdaCourseModel.restoreTesdaCourse(adminUuid);
  if (!restored) {
    const error = new Error('Course not found or is not currently deleted');
    error.statusCode = 404;
    throw error;
  }
  return restored;
}

const VALID_COMPETENCY_TYPES = ['basic', 'common', 'core'];

export async function addCompetency(adminUuid, type, data) {
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
  return newRow;
}

export async function editCompetency(type, competencyId, data) {
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
  return updated;
}

export async function removeCompetency(type, competencyId) {
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
  return deleted;
}

// => Generates a unique slug from a title, appending -2, -3... on collision.
// => checkTakenFn is injected so this same logic works for both TESDA and SHS
// => without duplicating the collision-retry loop in each service file.
async function generateUniqueSlug(baseTitle, checkTakenFn) {
  const base = slugify(baseTitle) || 'course';
  let candidate = base;
  let suffix = 2;
  while (await checkTakenFn(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix++;
  }
  return candidate;
}

// => "Enable Public Page" button on the detail page - idempotent, returns the
// => existing link untouched if one was already created for this course
export async function enablePublicLink(adminUuid) {
  const course = await TesdaCourseModel.findTesdaCourseByAdminUuid(adminUuid);
  if (!course) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    throw error;
  }

  const existing = await TesdaCourseModel.findPublicLinkByCourseId(course.course_id);
  if (existing) return existing;

  const slug = await generateUniqueSlug(course.title, (candidate) =>
    TesdaCourseModel.isSlugTaken(candidate)
  );

  return TesdaCourseModel.createPublicLink(course.course_id, slug);
}

// => Edits the slug and/or toggles is_published. published_at is stamped
// => only the FIRST time a course goes live - never overwritten on later
// => unpublish/republish cycles, so it reflects "originally published on".
export async function updatePublicLink(adminUuid, { public_slug, is_published }) {
  const course = await TesdaCourseModel.findTesdaCourseByAdminUuid(adminUuid);
  if (!course) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    throw error;
  }

  const existing = await TesdaCourseModel.findPublicLinkByCourseId(course.course_id);
  if (!existing) {
    const error = new Error('Public link not enabled for this course yet');
    error.statusCode = 404;
    throw error;
  }

  const fields = {};

  if (public_slug !== undefined && public_slug !== existing.public_slug) {
    const cleanSlug = slugify(public_slug);
    if (!cleanSlug) {
      const error = new Error('Slug cannot be empty');
      error.statusCode = 400;
      throw error;
    }
    const taken = await TesdaCourseModel.isSlugTaken(cleanSlug, course.course_id);
    if (taken) {
      const error = new Error('This slug is already in use by another course');
      error.statusCode = 409;
      throw error;
    }
    fields.public_slug = cleanSlug;
  }

  if (is_published !== undefined) {
    fields.is_published = is_published;
    if (is_published === true && !existing.published_at) {
      fields.published_at = new Date().toISOString();
    }
  }

  const updated = await TesdaCourseModel.updatePublicLink(course.course_id, fields);
  if (!updated) {
    const error = new Error('No valid fields to update');
    error.statusCode = 400;
    throw error;
  }
  return updated;
}

// => Job opportunities sub-resource - same validate-then-delegate pattern as competencies

export async function addJobOpportunity(adminUuid, jobTitle) {
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
  return newRow;
}

export async function editJobOpportunity(jobId, jobTitle) {
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
  return updated;
}

export async function removeJobOpportunity(jobId) {
  const deleted = await TesdaCourseModel.deleteJobOpportunity(jobId);
  if (!deleted) {
    const error = new Error('Job opportunity not found');
    error.statusCode = 404;
    throw error;
  }
  return deleted;
}
