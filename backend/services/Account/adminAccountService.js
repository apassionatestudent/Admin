// => Business logic for the admin self-service account page
import bcrypt from 'bcryptjs';
import { pool } from '../../config/db.js';
import { logActivity, getActivityLogsByActorPaginated } from '../../models/adminActivityLogModel.js';
import {
    findAdminById,
    findPasswordHashById,
    updateFullName,
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

// => Update the admin's display name only, then re-fetch full record
export async function updateProfile(adminId, fullName) {
    if (!fullName || !fullName.trim()) {
        throw { status: 400, message: 'Full name is required' };
    }

    const trimmedName = fullName.trim();
    await updateFullName(adminId, trimmedName);
    const account = await findAdminById(adminId);

    // => actor_type matches your existing convention: 'Admin', capitalized
    await logActivity(pool, {
        entity_type: 'admin',
        entity_id: adminId,
        actor_type: 'Admin',
        actor_id: adminId,
        actor_name: trimmedName,
        action: 'profile_updated',
        action_detail: `Updated display name to "${trimmedName}"`,
    });

    return account;
}

// => Update the day/night theme preference
export async function updateTheme(adminId, isNightMode) {
    if (typeof isNightMode !== 'boolean') {
        throw { status: 400, message: 'is_night_mode must be true or false' };
    }

    await updateNightMode(adminId, isNightMode);
    const account = await findAdminById(adminId);

    await logActivity(pool, {
        entity_type: 'admin',
        entity_id: adminId,
        actor_type: 'Admin',
        actor_id: adminId,
        actor_name: account.full_name,
        action: 'theme_updated',
        action_detail: `Switched to ${isNightMode ? 'night' : 'day'} mode`,
    });

    return account;
}

// => Verify current password, then hash and store the new one
export async function changePassword(adminId, currentPassword, newPassword) {
    if (!currentPassword || !newPassword) {
        throw { status: 400, message: 'Current and new password are required' };
    }
    if (newPassword.length < 8) {
        throw { status: 400, message: 'New password must be at least 8 characters' };
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
        actor_type: 'Admin',
        actor_id: adminId,
        actor_name: account.full_name,
        action: 'password_changed',
        action_detail: 'Changed account password',
    });
}

// => Fetch a page of every action this admin has performed system-wide,
//    not just actions taken on their own account record
export async function getAccountLogs(adminId, page = 1) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const { logs, total } = await getActivityLogsByActorPaginated(pool, 'Admin', adminId, pageNum, 10);
    return {
        logs,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / 10) || 1,
    };
}