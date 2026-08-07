// => admin/routes/Enrollments/shsEnrollmentRoute.js
// => Split out of the old adminEnrollmentRoute.js - mounted at
//    /api/admin/enrollments/shs in server.js. All paths below are
//    relative to that prefix, so they resolve to the exact same final
//    URLs the frontend already calls (e.g. this file's '/:publicId'
//    becomes /api/admin/enrollments/shs/:publicId).

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
import { adminApiRateLimit } from '../../middleware/adminRateLimit.js';
import {
  getShsEnrollmentDetail,
  patchShsEnrollmentStatus,
  patchShsProfile,
  patchShsAddress,
  patchShsEnrollmentFields,
  patchShsFamily,
  postShsDocument,
  patchShsDocument,
  deleteShsDocumentController,
  getAvailableShsClassesController,
  getShsLookupsController,
  getShsPaymentHistory,
} from '../../controllers/Enrollments/shsEnrollmentController.js';
import { upload } from '../../middleware/upload.js';

const router = express.Router();

// => GET /api/admin/enrollments/shs/classes/available?cluster=
// => MUST come before /:publicId below, or Express matches "classes"
//    as a :publicId value instead of this route.
router.get('/classes/available', adminApiRateLimit, protectAdmin, requireSection('enrollments'), getAvailableShsClassesController);

// => GET /api/admin/enrollments/shs/lookups - track/cluster reference data
// => MUST come before /:publicId below, same reason as /classes/available
router.get('/lookups', adminApiRateLimit, protectAdmin, requireSection('enrollments'), getShsLookupsController);

// => GET /api/admin/enrollments/shs/:publicId
router.get('/:publicId', adminApiRateLimit, protectAdmin, requireSection('enrollments'), getShsEnrollmentDetail);

// => GET /api/admin/enrollments/shs/:publicId/payment-history
router.get('/:publicId/payment-history', adminApiRateLimit, protectAdmin, requireSection('enrollments'), getShsPaymentHistory);

// => PATCH /api/admin/enrollments/shs/:publicId/status
// => Body: { status: string }
router.patch('/:publicId/status', adminApiRateLimit, protectAdmin, requireSection('enrollments'), patchShsEnrollmentStatus);

// => SHS section edits
router.patch('/:publicId/profile',    adminApiRateLimit, protectAdmin, requireSection('enrollments'), patchShsProfile);
router.patch('/:publicId/address',    adminApiRateLimit, protectAdmin, requireSection('enrollments'), patchShsAddress);
router.patch('/:publicId/enrollment', adminApiRateLimit, protectAdmin, requireSection('enrollments'), patchShsEnrollmentFields);
router.patch('/:publicId/family',     adminApiRateLimit, protectAdmin, requireSection('enrollments'), patchShsFamily);

// => Documents - add new / replace existing / delete
// => `upload` runs before the controller so req.file is populated;
//    Body must be sent as multipart/form-data with a `document` file
//    field and a `documentType` text field alongside it for the POST route
router.post('/:publicId/docs',               adminApiRateLimit, protectAdmin, requireSection('enrollments'), upload, postShsDocument);
router.patch('/:publicId/docs/:docPublicId', adminApiRateLimit, protectAdmin, requireSection('enrollments'), upload, patchShsDocument);
router.delete('/:publicId/docs/:docPublicId', adminApiRateLimit, protectAdmin, requireSection('enrollments'), deleteShsDocumentController);

export default router;