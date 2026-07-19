// => admin/routes/adminEnrollmentRoute.js
// => FULL REWRITE - routes now split by enrollment type to match the two
//    separate frontend detail components (TESDAEnrollmentDetail, SHSEnrollmentDetail)

import express from 'express';
import { protectAdmin } from '../middleware/adminAuth.js';
// => Import general admin API rate limiter (relaxed: 200 req / 10 min)
import { adminApiRateLimit } from '../middleware/adminRateLimit.js';
import {
  listPendingEnrollments,
  searchEnrollmentsController,
  getTesdaEnrollmentDetail,
  getShsEnrollmentDetail,
  patchTesdaEnrollmentStatus,
  patchShsEnrollmentStatus,
  patchTesdaProfile, patchTesdaAddress, patchTesdaGuardian,
  patchTesdaEnrollmentFields, patchTesdaClassifications,
  patchShsProfile, patchShsAddress, patchShsEnrollmentFields,
  patchShsFamily, postTesdaDocument, patchTesdaDocument,
  postShsDocument, patchShsDocument,
  deleteShsDocumentController,
  deleteTesdaDocumentController,
  getAvailableShsClassesController,
  getAvailableTesdaClassesController ,
  getShsLookupsController 
} from '../controllers/adminEnrollmentController.js';
import { adminProxyDocument } from '../controllers/adminDocProxyController.js';

import { upload } from '../middleware/upload.js';

const router = express.Router();

// => All admin enrollment routes require a valid admin JWT
// => protectAdmin middleware is applied to each route individually
// => adminApiRateLimit added to satisfy CodeQL CWE-770 (missing rate limiting)

// => GET /api/admin/enrollments - combined TESDA + SHS list
router.get('/', adminApiRateLimit, protectAdmin, listPendingEnrollments);

// => GET /api/admin/enrollments/search - combined TESDA + SHS search
router.get('/search', adminApiRateLimit, protectAdmin, searchEnrollmentsController);

// => GET /api/admin/enrollments/docs/:documentKey
// => Proxy route: streams R2 object to the browser through the server
// => documentKey contains slashes encoded as %2F
// => Generic by key - works for both tesda_documents and shs_documents rows,
//    since the R2 key alone is enough to stream the object
router.get('/docs/:documentKey', adminApiRateLimit, protectAdmin, adminProxyDocument);

// => GET /api/admin/enrollments/tesda/:publicId
router.get('/tesda/:publicId', adminApiRateLimit, protectAdmin, getTesdaEnrollmentDetail);

// => GET /api/admin/enrollments/shs/classes/available?track=&cluster=
// => MUST come before /shs/:publicId below, or Express matches "classes"
//    as a :publicId value instead of this route.
router.get('/shs/classes/available', adminApiRateLimit, protectAdmin, getAvailableShsClassesController);

// => GET /api/admin/enrollments/tesda/classes/available?course_id=
// => MUST come before /tesda/:publicId below, or Express matches "classes"
//    as a :publicId value instead of this route.
router.get('/tesda/classes/available', adminApiRateLimit, protectAdmin, getAvailableTesdaClassesController);

// => GET /api/admin/enrollments/shs/lookups - track/cluster reference data
// => MUST come before /shs/:publicId below, same reason as /shs/classes/available
router.get('/shs/lookups', adminApiRateLimit, protectAdmin, getShsLookupsController);

// => GET /api/admin/enrollments/shs/:publicId
router.get('/shs/:publicId', adminApiRateLimit, protectAdmin, getShsEnrollmentDetail);

// => PATCH /api/admin/enrollments/tesda/:publicId/status
// => Body: { status: string }
router.patch('/tesda/:publicId/status', adminApiRateLimit, protectAdmin, patchTesdaEnrollmentStatus);

// => PATCH /api/admin/enrollments/shs/:publicId/status
// => Body: { status: string }
router.patch('/shs/:publicId/status', adminApiRateLimit, protectAdmin, patchShsEnrollmentStatus);

// => TESDA section edits
router.patch('/tesda/:publicId/profile',        adminApiRateLimit, protectAdmin, patchTesdaProfile);
router.patch('/tesda/:publicId/address',         adminApiRateLimit, protectAdmin, patchTesdaAddress);
router.patch('/tesda/:publicId/guardian',        adminApiRateLimit, protectAdmin, patchTesdaGuardian);
router.patch('/tesda/:publicId/enrollment',      adminApiRateLimit, protectAdmin, patchTesdaEnrollmentFields);
router.patch('/tesda/:publicId/classifications', adminApiRateLimit, protectAdmin, patchTesdaClassifications);

// => SHS section edits
router.patch('/shs/:publicId/profile',    adminApiRateLimit, protectAdmin, patchShsProfile);
router.patch('/shs/:publicId/address',    adminApiRateLimit, protectAdmin, patchShsAddress);
router.patch('/shs/:publicId/enrollment', adminApiRateLimit, protectAdmin, patchShsEnrollmentFields);
router.patch('/shs/:publicId/family',     adminApiRateLimit, protectAdmin, patchShsFamily);

// => Documents - add new / replace existing
// => `upload` runs before the controller so req.file is populated;
//    Body must be sent as multipart/form-data with a `document` file
//    field and a `documentType` text field alongside it for POST routes
router.post('/tesda/:publicId/docs',               adminApiRateLimit, protectAdmin, upload, postTesdaDocument);
router.patch('/tesda/:publicId/docs/:docPublicId',  adminApiRateLimit, protectAdmin, upload, patchTesdaDocument);
router.post('/shs/:publicId/docs',                  adminApiRateLimit, protectAdmin, upload, postShsDocument);
router.patch('/shs/:publicId/docs/:docPublicId',    adminApiRateLimit, protectAdmin, upload, patchShsDocument);
router.delete('/shs/:publicId/docs/:docPublicId', adminApiRateLimit, protectAdmin, deleteShsDocumentController);
// => New - TESDA never had a delete route before this
router.delete('/tesda/:publicId/docs/:docPublicId', adminApiRateLimit, protectAdmin, deleteTesdaDocumentController);

export default router;