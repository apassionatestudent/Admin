// => services/shsCourseService.js

import * as ShsCourseModel from '../models/shsCourseModel.js';
import { slugify } from '../utils/slugify.js';

export async function listShsCourses() {
  return ShsCourseModel.findAllShsCourses();
}

export async function getShsCourseDetail(adminUuid) {
  const course = await ShsCourseModel.findShsCourseByAdminUuid(adminUuid);
  if (!course) return null;

  const jobOpportunities = await ShsCourseModel.findJobOpportunitiesByCourseId(course.course_id);
  const publicLink = await ShsCourseModel.findPublicLinkByCourseId(course.course_id);
  return { ...course, jobOpportunities, publicLink };
}

export async function createShsCourse({ course, jobOpportunities, adminId }) {
  const required = ['title', 'cluster_id', 'grade_level'];
  const missing = required.filter((field) => !course?.[field]);

  if (missing.length > 0) {
    const error = new Error(`Missing required fields: ${missing.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }

  return ShsCourseModel.insertShsCourseWithJobOpportunities({ course, jobOpportunities, adminId });
}

export async function updateShsCourse(adminUuid, fields) {
  const updated = await ShsCourseModel.updateShsCourse(adminUuid, fields);
  if (!updated) {
    const error = new Error('Course not found or no valid fields to update');
    error.statusCode = 404;
    throw error;
  }
  return updated;
}

export async function deleteShsCourse(adminUuid) {
  const deleted = await ShsCourseModel.softDeleteShsCourse(adminUuid);
  if (!deleted) {
    const error = new Error('Course not found or already deleted');
    error.statusCode = 404;
    throw error;
  }
  return deleted;
}

export async function listDeletedShsCourses() {
  return ShsCourseModel.findAllDeletedShsCourses();
}

export async function restoreShsCourse(adminUuid) {
  const restored = await ShsCourseModel.restoreShsCourse(adminUuid);
  if (!restored) {
    const error = new Error('Course not found or is not currently deleted');
    error.statusCode = 404;
    throw error;
  }
  return restored;
}

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

export async function enablePublicLink(adminUuid) {
  const course = await ShsCourseModel.findShsCourseByAdminUuid(adminUuid);
  if (!course) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    throw error;
  }

  const existing = await ShsCourseModel.findPublicLinkByCourseId(course.course_id);
  if (existing) return existing;

  const slug = await generateUniqueSlug(course.title, (candidate) =>
    ShsCourseModel.isSlugTaken(candidate)
  );

  return ShsCourseModel.createPublicLink(course.course_id, slug);
}

export async function updatePublicLink(adminUuid, { public_slug, is_published }) {
  const course = await ShsCourseModel.findShsCourseByAdminUuid(adminUuid);
  if (!course) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    throw error;
  }

  const existing = await ShsCourseModel.findPublicLinkByCourseId(course.course_id);
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
    const taken = await ShsCourseModel.isSlugTaken(cleanSlug, course.course_id);
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

  const updated = await ShsCourseModel.updatePublicLink(course.course_id, fields);
  if (!updated) {
    const error = new Error('No valid fields to update');
    error.statusCode = 400;
    throw error;
  }
  return updated;
}

// => Job opportunities sub-resource - same pattern as tesdaCourseService.js

export async function addJobOpportunity(adminUuid, jobTitle) {
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
  return newRow;
}

export async function editJobOpportunity(jobId, jobTitle) {
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
  return updated;
}

export async function removeJobOpportunity(jobId) {
  const deleted = await ShsCourseModel.deleteJobOpportunity(jobId);
  if (!deleted) {
    const error = new Error('Job opportunity not found');
    error.statusCode = 404;
    throw error;
  }
  return deleted;
}
