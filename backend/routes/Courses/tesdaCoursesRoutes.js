import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
import { csrfProtection } from '../../middleware/adminCsrf.js';
import { adminApiRateLimit } from '../../middleware/adminRateLimit.js';
import {
  getTesdaCourses,
  getCertificationTypes,
  getTesdaCourseById,
  createTesdaCourse,
  updateTesdaCourse,
  deleteTesdaCourse,
  addCompetency,
  updateCompetency,
  deleteCompetency,
  enablePublicLink,
  updatePublicLink,
  addJobOpportunity,
  updateJobOpportunity,
  deleteJobOpportunity,
  getDeletedTesdaCourses,
  restoreTesdaCourse,
} from '../../controllers/Courses/tesdaCourseController.js';

const router = express.Router();

router.use(adminApiRateLimit);
router.use(protectAdmin);
router.use(requireSection('courses'));
router.use(csrfProtection);

router.get('/certification-types', getCertificationTypes);
router.get('/deleted', getDeletedTesdaCourses);

router.get('/', getTesdaCourses);
router.post('/', createTesdaCourse);

router.get('/:adminUuid', getTesdaCourseById);
router.patch('/:adminUuid', updateTesdaCourse);
router.delete('/:adminUuid', deleteTesdaCourse);
router.post('/:adminUuid/restore', restoreTesdaCourse);

router.post('/:adminUuid/competencies', addCompetency);
router.patch('/competencies/:type/:competencyId', updateCompetency);
router.delete('/competencies/:type/:competencyId', deleteCompetency);

router.post('/:adminUuid/job-opportunities', addJobOpportunity);
router.patch('/job-opportunities/:jobId', updateJobOpportunity);
router.delete('/job-opportunities/:jobId', deleteJobOpportunity);

router.post('/:adminUuid/public-link', enablePublicLink);
router.patch('/:adminUuid/public-link', updatePublicLink);

export default router;