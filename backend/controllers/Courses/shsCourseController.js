// => controllers/shsCourseController.js

import * as ShsCourseService from '../../services/Courses/shsCourseService.js';

export async function getShsCourses(req, res) {
  try {
    const courses = await ShsCourseService.listShsCourses();
    res.status(200).json({ success: true, data: courses });
  } catch (error) {
    console.error('getShsCourses error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch SHS courses' });
  }
}

export async function getShsCourseById(req, res) {
  try {
    const { adminUuid } = req.params;
    const course = await ShsCourseService.getShsCourseDetail(adminUuid);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    res.status(200).json({ success: true, data: course });
  } catch (error) {
    console.error('getShsCourseById error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch course detail' });
  }
}

export async function createShsCourse(req, res) {
  try {
    const { course, jobOpportunities } = req.body;
    const adminId = req.admin?.admin_id;

    const newCourse = await ShsCourseService.createShsCourse({ course, jobOpportunities, adminId });
    res.status(201).json({ success: true, data: newCourse });
  } catch (error) {
    console.error('createShsCourse error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to create course' });
  }
}

export async function updateShsCourse(req, res) {
  try {
    const { adminUuid } = req.params;
    const updated = await ShsCourseService.updateShsCourse(adminUuid, req.body);
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error('updateShsCourse error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to update course' });
  }
}

export async function deleteShsCourse(req, res) {
  try {
    const { adminUuid } = req.params;
    await ShsCourseService.deleteShsCourse(adminUuid);
    res.status(200).json({ success: true, message: 'Course deleted' });
  } catch (error) {
    console.error('deleteShsCourse error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to delete course' });
  }
}

export async function getDeletedShsCourses(req, res) {
  try {
    const courses = await ShsCourseService.listDeletedShsCourses();
    res.status(200).json({ success: true, data: courses });
  } catch (error) {
    console.error('getDeletedShsCourses error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch deleted courses' });
  }
}

export async function restoreShsCourse(req, res) {
  try {
    const { adminUuid } = req.params;
    const restored = await ShsCourseService.restoreShsCourse(adminUuid);
    res.status(200).json({ success: true, data: restored });
  } catch (error) {
    console.error('restoreShsCourse error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to restore course' });
  }
}

export async function enablePublicLink(req, res) {
  try {
    const { adminUuid } = req.params;
    const link = await ShsCourseService.enablePublicLink(adminUuid);
    res.status(200).json({ success: true, data: link });
  } catch (error) {
    console.error('enablePublicLink error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to enable public link' });
  }
}

export async function updatePublicLink(req, res) {
  try {
    const { adminUuid } = req.params;
    const { public_slug, is_published } = req.body;
    const link = await ShsCourseService.updatePublicLink(adminUuid, { public_slug, is_published });
    res.status(200).json({ success: true, data: link });
  } catch (error) {
    console.error('updatePublicLink error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to update public link' });
  }
}

export async function addJobOpportunity(req, res) {
  try {
    const { adminUuid } = req.params;
    const { job_title } = req.body;
    const newRow = await ShsCourseService.addJobOpportunity(adminUuid, job_title);
    res.status(201).json({ success: true, data: newRow });
  } catch (error) {
    console.error('addJobOpportunity error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to add job opportunity' });
  }
}

export async function updateJobOpportunity(req, res) {
  try {
    const { jobId } = req.params;
    const { job_title } = req.body;
    const updated = await ShsCourseService.editJobOpportunity(jobId, job_title);
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error('updateJobOpportunity error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to update job opportunity' });
  }
}

export async function deleteJobOpportunity(req, res) {
  try {
    const { jobId } = req.params;
    await ShsCourseService.removeJobOpportunity(jobId);
    res.status(200).json({ success: true, message: 'Job opportunity deleted' });
  } catch (error) {
    console.error('deleteJobOpportunity error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to delete job opportunity' });
  }
}
