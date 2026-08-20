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
    const actor = { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name };

    const newCourse = await TesdaCourseService.createTesdaCourse({ course, competencies, jobOpportunities, actor });
    res.status(201).json({ success: true, data: newCourse });
  } catch (error) {
    console.error('createTesdaCourse error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to create course' });
  }
}

export async function updateTesdaCourse(req, res) {
  try {
    const { adminUuid } = req.params;
    const actor = { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name };
    const updated = await TesdaCourseService.updateTesdaCourse(adminUuid, req.body, actor);
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error('updateTesdaCourse error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to update course' });
  }
}

export async function deleteTesdaCourse(req, res) {
  try {
    const { adminUuid } = req.params;
    const actor = { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name };
    await TesdaCourseService.deleteTesdaCourse(adminUuid, actor);
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
    const actor = { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name };
    const restored = await TesdaCourseService.restoreTesdaCourse(adminUuid, actor);
    res.status(200).json({ success: true, data: restored });
  } catch (error) {
    console.error('restoreTesdaCourse error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to restore course' });
  }
}

// => Powers the detail page's Activity Log section - fetch-all-at-once, no pagination
export async function getTesdaCourseLogsController(req, res) {
  try {
    const { adminUuid } = req.params;
    const logs = await TesdaCourseService.getTesdaCourseLogs(adminUuid);
    res.status(200).json({ success: true, data: logs });
  } catch (error) {
    console.error('getTesdaCourseLogsController error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to fetch course logs' });
  }
}

export async function addCompetency(req, res) {
  try {
    const { adminUuid } = req.params;
    const { type, code, competency } = req.body;
    const actor = { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name };
    const newRow = await TesdaCourseService.addCompetency(adminUuid, type, { code, competency }, actor);
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
    const actor = { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name };
    const updated = await TesdaCourseService.editCompetency(type, competencyId, { code, competency }, actor);
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error('updateCompetency error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to update competency' });
  }
}

export async function deleteCompetency(req, res) {
  try {
    const { type, competencyId } = req.params;
    const actor = { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name };
    await TesdaCourseService.removeCompetency(type, competencyId, actor);
    res.status(200).json({ success: true, message: 'Competency deleted' });
  } catch (error) {
    console.error('deleteCompetency error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to delete competency' });
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

export async function addRequirement(req, res) {
  try {
    const { adminUuid } = req.params;
    const { document_type, is_required, max_files } = req.body;
    const actor = { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name };
    const newRow = await TesdaCourseService.addRequirement(adminUuid, { document_type, is_required, max_files }, actor);
    res.status(201).json({ success: true, data: newRow });
  } catch (error) {
    console.error('addRequirement error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to add requirement' });
  }
}

export async function updateRequirement(req, res) {
  try {
    const { requirementId } = req.params;
    const { document_type, is_required, max_files } = req.body;
    const actor = { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name };
    const updated = await TesdaCourseService.editRequirement(requirementId, { document_type, is_required, max_files }, actor);
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error('updateRequirement error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to update requirement' });
  }
}

export async function deleteRequirement(req, res) {
  try {
    const { requirementId } = req.params;
    const actor = { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name };
    await TesdaCourseService.removeRequirement(requirementId, actor);
    res.status(200).json({ success: true, message: 'Requirement deleted' });
  } catch (error) {
    console.error('deleteRequirement error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to delete requirement' });
  }
}
