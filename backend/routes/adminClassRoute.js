// => admin/routes/adminClassRoute.js
// => Mirrors adminEnrollmentRoute.js pattern

import express from 'express';
import { protectAdmin } from '../middleware/adminAuth.js';
import {
  listActiveClasses,
  searchClassesController,
  getFormOptions,
  getClassDetail,
  patchClassStatus,
  createClassController,
} from '../controllers/adminClassController.js';

const router = express.Router();

// => All class routes require a valid admin JWT
// => protectAdmin middleware is applied to each route individually

// => GET /api/admin/classes
// => Default list: Ongoing + Planned classes
router.get('/', protectAdmin, listActiveClasses);

// => GET /api/admin/classes/search
// => Search across all statuses
// => Must be declared BEFORE /:publicId to avoid Express treating 'search' as a publicId
router.get('/search', protectAdmin, searchClassesController);

// => GET /api/admin/classes/form-options
// => Returns dropdown data (courses, branches, instructors) for the Add Class modal
// => Must also be declared BEFORE /:publicId
router.get('/form-options', protectAdmin, getFormOptions);

// => GET /api/admin/classes/:publicId
// => Full detail bundle for one class
router.get('/:publicId', protectAdmin, getClassDetail);

// => PATCH /api/admin/classes/:publicId/status
// => Body: { status: 'Planned' | 'Ongoing' | 'Concluded' }
router.patch('/:publicId/status', protectAdmin, patchClassStatus);

// => POST /api/admin/classes
// => Body: all required class fields
router.post('/', protectAdmin, createClassController);

export default router;
