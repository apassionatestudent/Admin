// routes/Staff/staffInviteRoutes.js

import express from 'express';
import * as staffInviteController from '../../controllers/Staff/staffInviteController.js';

const router = express.Router();

// => Public - the invited staff member has no session yet, no protectAdmin/requireSuperAdmin here.
// => Mounted in server.js BEFORE csrfProtection so it bypasses the CSRF check entirely.
router.get('/:token', staffInviteController.validateToken);
router.post('/:token', staffInviteController.completeInvite);

export default router;