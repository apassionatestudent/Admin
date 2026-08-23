// => Business logic for the admin self-service account page
import bcrypt from 'bcryptjs';
import { pool } from '../../config/db.js';
import { logActivity, getActivityLogsByActorPaginated } from '../../models/adminActivityLogModel.js';

// => Same 4 rules enforced everywhere else a password gets set
// => (passwordTokenService.js, staffInviteService.js, accountServices.js
// => on the student side). This is the real gate, keep it in sync if the
// => rule set ever changes.
const validatePasswordStrength = (value) => {
    if (!value || value.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(value)) return 'Password must include at least one uppercase letter';
    if (!/[0-9]/.test(value)) return 'Password must include at least one number';
    if (!/[^A-Za-z0-9]/.test(value)) return 'Password must include at least one special character';
    return null;
};
import {
    findAdminById,
    findPasswordHashById,
    findAdminByEmailExcludingId,
    updateProfileFields,
    updateNightMode,
    updatePasswordHash,
} from '../../models/Account/adminAccountModel.js';

// => Return the current admin's account details
export async function getAccount(adminId) {
    const admin = await findAdminById(adminId);
    if (!admin) {
        throw { status: 404, message: 'Admin account not found' };
    }
    return admin;
}

// => Update the admin's display name and email together, then re-fetch
// => full record. Email uniqueness is checked here rather than relying on
// => a DB-level UNIQUE violation, so the person gets a clean 409 message
// => instead of a raw constraint error.
export async function updateProfile(adminId, role, fullName, email) {
    // => Only super_admin may edit their own name/email through this endpoint.
    //    Regular staff profile changes require super_admin intervention via
    //    the Staff management page instead.
    if (role !== 'super_admin') {
        throw { status: 403, message: 'Only the admin can edit profile information. Contact your system owner for changes.' };
    }

    if (!fullName || !fullName.trim()) {
        throw { status: 400, message: 'Full name is required' };
    }
    if (!email || !email.trim()) {
        throw { status: 400, message: 'Email is required' };
    }

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();

    // => Length cap before regex runs at all - defense in depth against
    // => ReDoS regardless of regex shape, and 254 is the practical RFC 5321
    // => max email length anyway
    if (trimmedEmail.length > 254) {
        throw { status: 400, message: 'Email address is too long' };
    }

    // => Bounded quantifiers (not unbounded +) on each segment - satisfies
    // => CodeQL's polynomial-regex-used-on-uncontrolled-data check, since
    // => bounded repetition cannot exhibit the backtracking blowup
    // => unbounded quantifiers can
    const emailPattern = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
    if (!emailPattern.test(trimmedEmail)) {
        throw { status: 400, message: 'Please enter a valid email address' };
    }

    const existing = await findAdminByEmailExcludingId(trimmedEmail, adminId);
    if (existing) {
        throw { status: 409, message: 'This email is already in use by another account' };
    }

    await updateProfileFields(adminId, trimmedName, trimmedEmail);
    const account = await findAdminById(adminId);

    // => entity_type is 'admin' (singular), matching the table name convention
    //    used everywhere else in the Logs table (tesda_enrollment, tesda_batch, etc.)
    await logActivity(pool, {
        entity_type: 'admin',
        entity_id: adminId,
        actor_type: 'Staff',
        actor_id: adminId,
        actor_name: trimmedName,
        action: 'UPDATE',
        action_detail: `Updated profile - name: "${trimmedName}", email: "${trimmedEmail}"`,
    });

    return account;
}

// => Update the day/night theme preference
export async function updateTheme(adminId, isNightMode) {
    if (typeof isNightMode !== 'boolean') {
        throw { status: 400, message: 'is_night_mode must be true or false' };
    }

    // => Theme preference is a personal display setting, not an auditable
    //    account change, so this intentionally does not call logActivity
    await updateNightMode(adminId, isNightMode);
    const account = await findAdminById(adminId);

    return account;
}

// => Verify current password, then hash and store the new one
export async function changePassword(adminId, currentPassword, newPassword) {
    if (!currentPassword || !newPassword) {
        throw { status: 400, message: 'Current and new password are required' };
    }
    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
        throw { status: 400, message: passwordError };
    }

    const record = await findPasswordHashById(adminId);
    if (!record) {
        throw { status: 404, message: 'Admin account not found' };
    }

    const isMatch = await bcrypt.compare(currentPassword, record.password_hash);
    if (!isMatch) {
        throw { status: 401, message: 'Current password is incorrect' };
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await updatePasswordHash(adminId, newHash);

    // => Fetch name for the log snapshot, password value itself is never logged
    const account = await findAdminById(adminId);

    await logActivity(pool, {
        entity_type: 'admin',
        entity_id: adminId,
        actor_type: 'Staff',
        actor_id: adminId,
        actor_name: account.full_name,
        action: 'PASSWORD_CHANGE',
        action_detail: 'Changed account password',
    });
}

// => Fetch a page of every action this admin has performed system-wide,
//    not just actions taken on their own account record
export async function getAccountLogs(adminId, page = 1) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const { logs, total } = await getActivityLogsByActorPaginated(pool, 'Staff', adminId, pageNum, 10);
    return {
        logs,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / 10) || 1,
    };
}