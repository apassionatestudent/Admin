// => controllers/publicCourseLinkController.js

import * as PublicCourseLinkService from '../services/publicCourseLinkService.js';

export async function getTesdaCourseList(req, res) {
  try {
    const courses = await PublicCourseLinkService.listPublishedTesdaCourses();
    res.status(200).json({ success: true, data: courses });
  } catch (error) {
    console.error('getTesdaCourseList error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch courses' });
  }
}

export async function getTesdaCourseBySlug(req, res) {
  try {
    const { slug } = req.params;
    const course = await PublicCourseLinkService.getPublishedTesdaCourseBySlug(slug);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    res.status(200).json({ success: true, data: course });
  } catch (error) {
    console.error('getTesdaCourseBySlug error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch course' });
  }
}

export async function getShsCourseList(req, res) {
  try {
    const courses = await PublicCourseLinkService.listPublishedShsCourses();
    res.status(200).json({ success: true, data: courses });
  } catch (error) {
    console.error('getShsCourseList error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch courses' });
  }
}

export async function getShsCourseBySlug(req, res) {
  try {
    const { slug } = req.params;
    const course = await PublicCourseLinkService.getPublishedShsCourseBySlug(slug);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    res.status(200).json({ success: true, data: course });
  } catch (error) {
    console.error('getShsCourseBySlug error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch course' });
  }
}
