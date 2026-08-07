// services/Staff/staffInviteService.js

import bcrypt from 'bcryptjs';
import * as staffModel from '../../models/Staff/staffModel.js';

// => Confirms a raw token from the email link is still valid, without consuming it -
// => used to render the "set your password" page
export async function validateInviteToken(rawToken) {
    const tokenRow = await staffModel.findValidInviteToken(rawToken);
    if (!tokenRow) {
        const error = new Error('This invite link is invalid or has expired');
        error.status = 400;
        throw error;
    }
    return { fullName: tokenRow.full_name, email: tokenRow.email };
}

// => Consumes the token and sets the staff member's real password
export async function completeInvite(rawToken, newPassword) {
    if (!newPassword || newPassword.length < 8) {
        const error = new Error('Password must be at least 8 characters');
        error.status = 400;
        throw error;
    }

    const tokenRow = await staffModel.findValidInviteToken(rawToken);
    if (!tokenRow) {
        const error = new Error('This invite link is invalid or has expired');
        error.status = 400;
        throw error;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await staffModel.setAdminPassword(tokenRow.admin_id, passwordHash);
    await staffModel.markInviteTokenUsed(tokenRow.token_id);

    return { message: 'Password set successfully. You can now log in.' };
}