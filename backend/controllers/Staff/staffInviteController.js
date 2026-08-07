// controllers/Staff/staffInviteController.js

import * as staffInviteService from '../../services/Staff/staffInviteService.js';

export async function validateToken(req, res) {
    try {
        const info = await staffInviteService.validateInviteToken(req.params.token);
        res.json(info);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Invalid invite link' });
    }
}

export async function completeInvite(req, res) {
    try {
        const { password } = req.body;
        const result = await staffInviteService.completeInvite(req.params.token, password);
        res.json(result);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to set password' });
    }
}