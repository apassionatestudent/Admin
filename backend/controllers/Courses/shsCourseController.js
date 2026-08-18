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
    const actor = { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name };

    const newCourse = await ShsCourseService.createShsCourse({ course, jobOpportunities, actor });
    res.status(201).json({ success: true, data: newCourse });
  } catch (error) {
    console.error('createShsCourse error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to create course' });
  }
}

export async function updateShsCourse(req, res) {
  try {
    const { adminUuid } = req.params;
    const actor = { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name };
    const updated = await ShsCourseService.updateShsCourse(adminUuid, req.body, actor);
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error('updateShsCourse error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to update course' });
  }
}

export async function deleteShsCourse(req, res) {
  try {
    const { adminUuid } = req.params;
    const actor = { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name };
    await ShsCourseService.deleteShsCourse(adminUuid, actor);
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
    const actor = { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name };
    const restored = await ShsCourseService.restoreShsCourse(adminUuid, actor);
    res.status(200).json({ success: true, data: restored });
  } catch (error) {
    console.error('restoreShsCourse error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to restore course' });
  }
}

// => Powers the detail page's Activity Log section - fetch-all-at-once, no pagination
export async function getShsCourseLogsController(req, res) {
  try {
    const { adminUuid } = req.params;
    const logs = await ShsCourseService.getShsCourseLogs(adminUuid);
    res.status(200).json({ success: true, data: logs });
  } catch (error) {
    console.error('getShsCourseLogsController error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to fetch course logs' });
  }
}

// => Publish/public-link controllers removed (enablePublicLink, updatePublicLink)

export async function addJobOpportunity(req, res) {
  try {
    const { adminUuid } = req.params;
    const { job_title } = req.body;
    const actor = { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name };
    const newRow = await ShsCourseService.addJobOpportunity(adminUuid, job_title, actor);
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
    const actor = { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name };
    const updated = await ShsCourseService.editJobOpportunity(jobId, job_title, actor);
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error('updateJobOpportunity error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to update job opportunity' });
  }
}

export async function deleteJobOpportunity(req, res) {
  try {
    const { jobId } = req.params;
    const actor = { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name };
    await ShsCourseService.removeJobOpportunity(jobId, actor);
    res.status(200).json({ success: true, message: 'Job opportunity deleted' });
  } catch (error) {
    console.error('deleteJobOpportunity error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to delete job opportunity' });
  }
}
