import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
import { csrfProtection } from '../../middleware/adminCsrf.js';
import { adminApiRateLimit } from '../../middleware/adminRateLimit.js';
import {
  getShsCourses,
  getShsCourseById,
  createShsCourse,
  updateShsCourse,
  deleteShsCourse,
  addJobOpportunity,
  updateJobOpportunity,
  deleteJobOpportunity,
  getDeletedShsCourses,
  restoreShsCourse,
  getShsCourseLogsController,
} from '../../controllers/Courses/shsCourseController.js';

const router = express.Router();

router.use(protectAdmin);
router.use(requireSection('courses'));
router.use(adminApiRateLimit);
router.use(csrfProtection);

router.get('/deleted', getDeletedShsCourses);

router.get('/', getShsCourses);
router.post('/', createShsCourse);

router.get('/:adminUuid', getShsCourseById);
router.patch('/:adminUuid', updateShsCourse);
router.delete('/:adminUuid', deleteShsCourse);
router.post('/:adminUuid/restore', restoreShsCourse);
router.get('/:adminUuid/logs', getShsCourseLogsController);

router.post('/:adminUuid/job-opportunities', addJobOpportunity);
router.patch('/job-opportunities/:jobId', updateJobOpportunity);
router.delete('/job-opportunities/:jobId', deleteJobOpportunity);

export default router;