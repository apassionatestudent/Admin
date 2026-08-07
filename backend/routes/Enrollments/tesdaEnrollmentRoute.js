// => admin/routes/Enrollments/tesdaEnrollmentRoute.js
// => Split out of the old adminEnrollmentRoute.js - mounted at
//    /api/admin/enrollments/tesda in server.js. All paths below are
//    relative to that prefix, so they resolve to the exact same final
//    URLs the frontend already calls (e.g. this file's '/:publicId'
//    becomes /api/admin/enrollments/tesda/:publicId).

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
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
  getTesdaPaymentHistory,
} from '../../controllers/Enrollments/tesdaEnrollmentController.js';
import { upload } from '../../middleware/upload.js';

const router = express.Router();

// => GET /api/admin/enrollments/tesda/classes/available?course_id=
// => MUST come before /:publicId below, or Express matches "classes"
//    as a :publicId value instead of this route.
router.get('/classes/available', adminApiRateLimit, protectAdmin, requireSection('enrollments'), getAvailableTesdaClassesController);

// => GET /api/admin/enrollments/tesda/:publicId
router.get('/:publicId', adminApiRateLimit, protectAdmin, requireSection('enrollments'), getTesdaEnrollmentDetail);

// => GET /api/admin/enrollments/tesda/:publicId/payment-history
router.get('/:publicId/payment-history', adminApiRateLimit, protectAdmin, requireSection('enrollments'), getTesdaPaymentHistory);

// => PATCH /api/admin/enrollments/tesda/:publicId/status
// => Body: { status: string }
router.patch('/:publicId/status', adminApiRateLimit, protectAdmin, requireSection('enrollments'), patchTesdaEnrollmentStatus);

// => TESDA section edits
router.patch('/:publicId/profile',        adminApiRateLimit, protectAdmin, requireSection('enrollments'), patchTesdaProfile);
router.patch('/:publicId/address',        adminApiRateLimit, protectAdmin, requireSection('enrollments'), patchTesdaAddress);
router.patch('/:publicId/guardian',       adminApiRateLimit, protectAdmin, requireSection('enrollments'), patchTesdaGuardian);
router.patch('/:publicId/enrollment',     adminApiRateLimit, protectAdmin, requireSection('enrollments'), patchTesdaEnrollmentFields);
router.patch('/:publicId/classifications', adminApiRateLimit, protectAdmin, requireSection('enrollments'), patchTesdaClassifications);

// => Documents - add new / replace existing / delete
// => `upload` runs before the controller so req.file is populated;
//    Body must be sent as multipart/form-data with a `document` file
//    field and a `documentType` text field alongside it for the POST route
router.post('/:publicId/docs',               adminApiRateLimit, protectAdmin, requireSection('enrollments'), upload, postTesdaDocument);
router.patch('/:publicId/docs/:docPublicId', adminApiRateLimit, protectAdmin, requireSection('enrollments'), upload, patchTesdaDocument);
router.delete('/:publicId/docs/:docPublicId', adminApiRateLimit, protectAdmin, requireSection('enrollments'), deleteTesdaDocumentController);

export default router;