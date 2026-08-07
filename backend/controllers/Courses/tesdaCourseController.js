// => controllers/tesdaCourseController.js

import * as TesdaCourseService from '../../services/Courses/tesdaCourseService.js';

export async function getTesdaCourses(req, res) {
  try {
    const courses = await TesdaCourseService.listTesdaCourses();
    res.status(200).json({ success: true, data: courses });
  } catch (error) {
    console.error('getTesdaCourses error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch TESDA courses' });
  }
}

export async function getCertificationTypes(req, res) {
  try {
    const types = await TesdaCourseService.listCertificationTypes();
    res.status(200).json({ success: true, data: types });
  } catch (error) {
    console.error('getCertificationTypes error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch certification types' });
  }
}

export async function getTesdaCourseById(req, res) {
  try {
    const { adminUuid } = req.params;
    const course = await TesdaCourseService.getTesdaCourseDetail(adminUuid);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    res.status(200).json({ success: true, data: course });
  } catch (error) {
    console.error('getTesdaCourseById error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch course detail' });
  }
}

export async function createTesdaCourse(req, res) {
  try {
    const { course, competencies, jobOpportunities } = req.body;
    // => req.admin is attached by the protectAdmin middleware (decoded JWT payload)
    const adminId = req.admin?.admin_id;

    const newCourse = await TesdaCourseService.createTesdaCourse({ course, competencies, jobOpportunities, adminId });
    res.status(201).json({ success: true, data: newCourse });
  } catch (error) {
    console.error('createTesdaCourse error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to create course' });
  }
}

export async function updateTesdaCourse(req, res) {
  try {
    const { adminUuid } = req.params;
    const updated = await TesdaCourseService.updateTesdaCourse(adminUuid, req.body);
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error('updateTesdaCourse error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to update course' });
  }
}

export async function deleteTesdaCourse(req, res) {
  try {
    const { adminUuid } = req.params;
    await TesdaCourseService.deleteTesdaCourse(adminUuid);
    res.status(200).json({ success: true, message: 'Course deleted' });
  } catch (error) {
    console.error('deleteTesdaCourse error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to delete course' });
  }
}

export async function getDeletedTesdaCourses(req, res) {
  try {
    const courses = await TesdaCourseService.listDeletedTesdaCourses();
    res.status(200).json({ success: true, data: courses });
  } catch (error) {
    console.error('getDeletedTesdaCourses error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch deleted courses' });
  }
}

export async function restoreTesdaCourse(req, res) {
  try {
    const { adminUuid } = req.params;
    const restored = await TesdaCourseService.restoreTesdaCourse(adminUuid);
    res.status(200).json({ success: true, data: restored });
  } catch (error) {
    console.error('restoreTesdaCourse error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to restore course' });
  }
}

export async function addCompetency(req, res) {
  try {
    const { adminUuid } = req.params;
    const { type, code, competency } = req.body;
    const newRow = await TesdaCourseService.addCompetency(adminUuid, type, { code, competency });
    res.status(201).json({ success: true, data: newRow });
  } catch (error) {
    console.error('addCompetency error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to add competency' });
  }
}

export async function updateCompetency(req, res) {
  try {
    const { type, competencyId } = req.params;
    const { code, competency } = req.body;
    const updated = await TesdaCourseService.editCompetency(type, competencyId, { code, competency });
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error('updateCompetency error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to update competency' });
  }
}

export async function deleteCompetency(req, res) {
  try {
    const { type, competencyId } = req.params;
    await TesdaCourseService.removeCompetency(type, competencyId);
    res.status(200).json({ success: true, message: 'Competency deleted' });
  } catch (error) {
    console.error('deleteCompetency error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to delete competency' });
  }
}

export async function enablePublicLink(req, res) {
  try {
    const { adminUuid } = req.params;
    const link = await TesdaCourseService.enablePublicLink(adminUuid);
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
    const link = await TesdaCourseService.updatePublicLink(adminUuid, { public_slug, is_published });
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
    const newRow = await TesdaCourseService.addJobOpportunity(adminUuid, job_title);
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
    const updated = await TesdaCourseService.editJobOpportunity(jobId, job_title);
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error('updateJobOpportunity error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to update job opportunity' });
  }
}

export async function deleteJobOpportunity(req, res) {
  try {
    const { jobId } = req.params;
    await TesdaCourseService.removeJobOpportunity(jobId);
    res.status(200).json({ success: true, message: 'Job opportunity deleted' });
  } catch (error) {
    console.error('deleteJobOpportunity error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to delete job opportunity' });
  }
}
