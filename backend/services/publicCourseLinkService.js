// => services/publicCourseLinkService.js

import * as PublicCourseLinkModel from '../models/publicCourseLinkModel.js';

export async function listPublishedTesdaCourses() {
  return PublicCourseLinkModel.findAllPublishedTesdaCourses();
}

export async function getPublishedTesdaCourseBySlug(slug) {
  const course = await PublicCourseLinkModel.findPublishedTesdaCourseBySlug(slug);
  if (!course) return null;

  const competencies = await PublicCourseLinkModel.findCompetenciesForPublishedTesdaCourse(slug);
  return { ...course, competencies };
}

export async function listPublishedShsCourses() {
  return PublicCourseLinkModel.findAllPublishedShsCourses();
}

export async function getPublishedShsCourseBySlug(slug) {
  return PublicCourseLinkModel.findPublishedShsCourseBySlug(slug);
}
