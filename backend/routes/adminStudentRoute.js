// => admin/routes/adminStudentRoute.js
// => Mirrors adminClassRoute.js pattern

import express from 'express';
import { protectAdmin } from '../middleware/adminAuth.js';
import {
  listStudents,
  searchStudentsController,
  getStudentDetail,
  patchStudentActive,
  updateStudentController,
} from '../controllers/adminStudentController.js';

const router = express.Router();

// => All student routes require a valid admin JWT
// => protectAdmin middleware applied per-route

// => GET /api/admin/students
// => Paginated list, latest 10 first; ?page=N for subsequent pages
router.get('/', protectAdmin, listStudents);

// => GET /api/admin/students/search
// => Search by name fields and email/username
// => Must be declared BEFORE /:publicId to avoid Express treating 'search' as a publicId
router.get('/search', protectAdmin, searchStudentsController);

// => GET /api/admin/students/:publicId
// => Full detail bundle: account + profile + enrollment history
router.get('/:publicId', protectAdmin, getStudentDetail);

// => PATCH /api/admin/students/:publicId/active
// => Body: { is_active: true | false }
router.patch('/:publicId/active', protectAdmin, patchStudentActive);

// => PUT /api/admin/students/:publicId
// => Body: all editable profile + account fields
router.put('/:publicId', protectAdmin, updateStudentController);

export default router;
