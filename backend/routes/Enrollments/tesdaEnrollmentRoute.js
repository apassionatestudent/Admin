// => admin/routes/Enrollments/tesdaEnrollmentRoute.js
// => Split out of the old adminEnrollmentRoute.js - mounted at
//    /api/admin/enrollments/tesda in server.js. All paths below are
//    relative to that prefix, so they resolve to the exact same final
//    URLs the frontend already calls (e.g. this file's '/:publicId'
//    becomes /api/admin/enrollments/tesda/:publicId).

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { adminApiRateLimit } from '../../middleware/adminRateLimit.js';
import {
  getTesdaEnrollmentDetail,
  patchTesdaEnrollmentStatus,
  patchTesdaProfile,
  patchTesdaAddress,
  patchTesdaGuardian,
  patchTesdaEnrollmentFields,
  patchTesdaClassifications,
  postTesdaDocument,
  patchTesdaDocument,
  deleteTesdaDocumentController,
  getAvailableTesdaClassesController,
} from '../../controllers/Enrollments/tesdaEnrollmentController.js';
import { upload } from '../../middleware/upload.js';

const router = express.Router();

// => GET /api/admin/enrollments/tesda/classes/available?course_id=
// => MUST come before /:publicId below, or Express matches "classes"
//    as a :publicId value instead of this route.
router.get('/classes/available', adminApiRateLimit, protectAdmin, getAvailableTesdaClassesController);

// => GET /api/admin/enrollments/tesda/:publicId
router.get('/:publicId', adminApiRateLimit, protectAdmin, getTesdaEnrollmentDetail);

// => PATCH /api/admin/enrollments/tesda/:publicId/status
// => Body: { status: string }
router.patch('/:publicId/status', adminApiRateLimit, protectAdmin, patchTesdaEnrollmentStatus);

// => TESDA section edits
router.patch('/:publicId/profile',        adminApiRateLimit, protectAdmin, patchTesdaProfile);
router.patch('/:publicId/address',        adminApiRateLimit, protectAdmin, patchTesdaAddress);
router.patch('/:publicId/guardian',       adminApiRateLimit, protectAdmin, patchTesdaGuardian);
router.patch('/:publicId/enrollment',     adminApiRateLimit, protectAdmin, patchTesdaEnrollmentFields);
router.patch('/:publicId/classifications', adminApiRateLimit, protectAdmin, patchTesdaClassifications);

// => Documents - add new / replace existing / delete
// => `upload` runs before the controller so req.file is populated;
//    Body must be sent as multipart/form-data with a `document` file
//    field and a `documentType` text field alongside it for the POST route
router.post('/:publicId/docs',               adminApiRateLimit, protectAdmin, upload, postTesdaDocument);
router.patch('/:publicId/docs/:docPublicId', adminApiRateLimit, protectAdmin, upload, patchTesdaDocument);
router.delete('/:publicId/docs/:docPublicId', adminApiRateLimit, protectAdmin, deleteTesdaDocumentController);

export default router;
