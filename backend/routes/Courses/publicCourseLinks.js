// => No protectAdmin / auth here - these are intentionally public,
// => unauthenticated read-only endpoints for the marketing site.
// => Mounted at a NEW path ('/api/public/courses' suggested below) rather
// => than reusing your existing '/api/courses' router, since I don't have
// => visibility into what that router already does - check for path
// => collisions before wiring this in if you'd rather fold it in there instead.

import express from 'express';
import {
  getTesdaCourseList,
  getTesdaCourseBySlug,
  getShsCourseList,
  getShsCourseBySlug,
} from '../../controllers/Courses/publicCourseLinkController.js';

const router = express.Router();

router.get('/tesda', getTesdaCourseList);
router.get('/tesda/:slug', getTesdaCourseBySlug);

router.get('/shs', getShsCourseList);
router.get('/shs/:slug', getShsCourseBySlug);

export default router;
