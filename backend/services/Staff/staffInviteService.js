// services/Staff/staffInviteService.js

import bcrypt from 'bcryptjs';
import * as staffModel from '../../models/Staff/staffModel.js';
// => pool is needed here since logActivity takes pool as its first argument
import { pool } from '../../config/db.js';
import { logActivity } from '../../models/adminActivityLogModel.js';
import { ACTIVITY_ACTIONS } from '../../constants/activityActions.js';

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
// => Same 4 rules enforced on the frontend (setAdminPassword.jsx PASSWORD_RULES)
// => Backend is the real gate since a direct API call bypasses the UI entirely
const validatePasswordStrength = (value) => {
    if (!value || value.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(value)) return 'Password must include at least one uppercase letter';
    if (!/[0-9]/.test(value)) return 'Password must include at least one number';
    if (!/[^A-Za-z0-9]/.test(value)) return 'Password must include at least one special character';
    return null;
};

export async function completeInvite(rawToken, newPassword) {
    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
        const error = new Error(passwordError);
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

    // => No requestingAdmin here, nobody is logged in during this flow.
    // => The staff member completing their own invite is the actor.
    // => purpose distinguishes invite vs reset (see createInviteToken),
    // => reused here to write a more accurate action_detail for either case.
    await logActivity(pool, {
        entity_type: 'admin',
        entity_id: tokenRow.admin_id,
        actor_type: 'Staff',
        actor_id: tokenRow.admin_id,
        actor_name: tokenRow.full_name,
        action: ACTIVITY_ACTIONS.PASSWORD_CHANGE,
        action_detail: tokenRow.purpose === 'reset'
            ? `${tokenRow.full_name} completed a password reset.`
            : `${tokenRow.full_name} completed account setup and set their password.`,
    });

    return { message: 'Password set successfully. You can now log in.' };
}