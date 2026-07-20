// => routes/tesdaCourses.js

import express from 'express';
import { protectAdmin } from '../middleware/adminAuth.js';
import { adminApiRateLimit } from '../middleware/adminRateLimit.js';
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
} from '../controllers/tesdaCourseController.js';

const router = express.Router();

// => Every route on this router requires a logged-in admin
router.use(protectAdmin);
router.use(adminApiRateLimit);

// => Sector list moved to sectorClusterRoutes.js (GET /api/admin/sectors)
// => Static sub-paths BEFORE ':adminUuid', same reasoning as before
router.get('/certification-types', getCertificationTypes);
router.get('/deleted', getDeletedTesdaCourses);

router.get('/', getTesdaCourses);
router.post('/', createTesdaCourse);

router.get('/:adminUuid', getTesdaCourseById);
router.patch('/:adminUuid', updateTesdaCourse);
router.delete('/:adminUuid', deleteTesdaCourse);
router.post('/:adminUuid/restore', restoreTesdaCourse);

// => Competency sub-resources - add is scoped under the course, but edit/delete
// => are flat since a competency row's id is already unique within its own table
router.post('/:adminUuid/competencies', addCompetency);
router.patch('/competencies/:type/:competencyId', updateCompetency);
router.delete('/competencies/:type/:competencyId', deleteCompetency);

// => Job opportunities sub-resource - same add-scoped/edit-flat pattern as competencies
router.post('/:adminUuid/job-opportunities', addJobOpportunity);
router.patch('/job-opportunities/:jobId', updateJobOpportunity);
router.delete('/job-opportunities/:jobId', deleteJobOpportunity);

// => Public link sub-resource - POST enables it (auto-generates slug from
// => title), PATCH edits the slug and/or toggles is_published
router.post('/:adminUuid/public-link', enablePublicLink);
router.patch('/:adminUuid/public-link', updatePublicLink);

export default router;
