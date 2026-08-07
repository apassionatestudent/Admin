import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
import { adminApiRateLimit } from '../../middleware/adminRateLimit.js';
import {
  getShsCourses,
  getShsCourseById,
  createShsCourse,
  updateShsCourse,
  deleteShsCourse,
  enablePublicLink,
  updatePublicLink,
  addJobOpportunity,
  updateJobOpportunity,
  deleteJobOpportunity,
  getDeletedShsCourses,
  restoreShsCourse,
} from '../../controllers/Courses/shsCourseController.js';

const router = express.Router();

router.use(protectAdmin);
router.use(requireSection('courses'));
router.use(adminApiRateLimit);

// => Cluster list moved to sectorClusterRoutes.js (GET /api/admin/clusters)
// => Static sub-path BEFORE ':adminUuid'
router.get('/deleted', getDeletedShsCourses);

router.get('/', getShsCourses);
router.post('/', createShsCourse);

router.get('/:adminUuid', getShsCourseById);
router.patch('/:adminUuid', updateShsCourse);
router.delete('/:adminUuid', deleteShsCourse);
router.post('/:adminUuid/restore', restoreShsCourse);

// => Job opportunities sub-resource - same pattern as tesdaCourses.js
router.post('/:adminUuid/job-opportunities', addJobOpportunity);
router.patch('/job-opportunities/:jobId', updateJobOpportunity);
router.delete('/job-opportunities/:jobId', deleteJobOpportunity);

// => Public link sub-resource - same pattern as tesdaCourses.js
router.post('/:adminUuid/public-link', enablePublicLink);
router.patch('/:adminUuid/public-link', updatePublicLink);

export default router;