// => admin/routes/Enrollments/sharedEnrollmentRoute.js
// => Split out of the old adminEnrollmentRoute.js - mounted at
//    /api/admin/enrollments in server.js. Holds the combined TESDA + SHS
//    list, combined search, and the generic R2 document proxy (works for
//    both types since it streams by document key alone).

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
import { adminApiRateLimit } from '../../middleware/adminRateLimit.js';
import {
  listPendingEnrollments,
  searchEnrollmentsController,
} from '../../controllers/Enrollments/sharedEnrollmentController.js';
import { adminProxyDocument } from '../../controllers/adminDocProxyController.js';

const router = express.Router();

// => All admin enrollment routes require a valid admin JWT AND the
//    'enrollments' section granted (or super_admin, which bypasses this)
// => adminApiRateLimit added to satisfy CodeQL CWE-770 (missing rate limiting)

// => GET /api/admin/enrollments - combined TESDA + SHS list
router.get('/', adminApiRateLimit, protectAdmin, requireSection('enrollments'), listPendingEnrollments);

// => GET /api/admin/enrollments/search - combined TESDA + SHS search
router.get('/search', adminApiRateLimit, protectAdmin, requireSection('enrollments'), searchEnrollmentsController);

// => GET /api/admin/enrollments/docs/:documentKey
// => Proxy route: streams R2 object to the browser through the server
// => documentKey contains slashes encoded as %2F
// => Generic by key - works for both tesda_documents and shs_documents rows,
//    since the R2 key alone is enough to stream the object
router.get('/docs/:documentKey', adminApiRateLimit, protectAdmin, requireSection('enrollments'), adminProxyDocument);

export default router;