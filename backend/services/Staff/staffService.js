// services/Staff/staffService.js

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import * as staffModel from '../../models/Staff/staffModel.js';
import { logActivity, getActivityLogsByActorPaginated } from '../../models/adminActivityLogModel.js';
import { sendStaffInviteEmail } from '../../utils/sendStaffInviteEmail.js';
import { sendStaffResetPasswordEmail } from '../../utils/sendStaffResetPasswordEmail.js';
import { pool } from '../../config/db.js';

const ALLOWED_SECTIONS = [
    'enrollments', 'classes', 'support-tickets', 'students',
    'reports', 'payments', 'courses', 'pages', 'logs', 'chatbots',
];

const PAGE_SIZE = 10;

async function attachPermissions(admin) {
    if (!admin) return null;
    if (admin.role === 'super_admin') {
        return { ...admin, sections: ALLOWED_SECTIONS };
    }
    const sections = await staffModel.getPermissionsByAdminId(admin.admin_id);
    return { ...admin, sections };
}

export async function listAdmins({ page = 1, search = '' }) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const offset = (safePage - 1) * PAGE_SIZE;

    const [admins, total] = await Promise.all([
        staffModel.findAllAdmins({ limit: PAGE_SIZE, offset, search }),
        staffModel.countAdmins({ search }),
    ]);

    const withSections = await Promise.all(admins.map(attachPermissions));

    return {
        admins: withSections,
        page: safePage,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        total,
    };
}

export async function getAdminDetail(publicId) {
    const admin = await staffModel.findAdminByPublicId(publicId);
    if (!admin || admin.role === 'super_admin') {
        const error = new Error('Staff member not found');
        error.status = 404;
        throw error;
    }
    return attachPermissions(admin);
}

export async function createAdmin({ fullName, email, sections = [] }, requestingAdmin) {
    if (!fullName || !email) {
        const error = new Error('Full name and email are required');
        error.status = 400;
        throw error;
    }

    const existing = await staffModel.findAdminByEmail(email);
    if (existing) {
        const error = new Error('A staff account with this email already exists');
        error.status = 409;
        throw error;
    }

    const invalidSection = sections.find(s => !ALLOWED_SECTIONS.includes(s));
    if (invalidSection) {
        const error = new Error(`Unknown section: ${invalidSection}`);
        error.status = 400;
        throw error;
    }

    const created = await staffModel.createAdmin({ fullName, email });

    if (sections.length > 0) {
        await staffModel.replacePermissions(created.admin_id, sections, requestingAdmin.admin_id);
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await staffModel.createInviteToken(created.admin_id, rawToken, expiresAt, 'invite');

    await logActivity(pool, {
        entity_type: 'admin',
        entity_id: created.admin_id,
        actor_type: 'Admin',
        actor_id: requestingAdmin.admin_id,
        actor_name: requestingAdmin.full_name,
        action: 'create_staff',
        action_detail: `Created staff account for ${fullName} (${email})`,
    });

    const finalAdmin = await attachPermissions(await staffModel.findAdminByPublicId(created.public_id));

    try {
        await sendStaffInviteEmail({ toEmail: email, fullName, rawToken });
        return { ...finalAdmin, inviteEmailSent: true };
    } catch (emailError) {
        console.error('Invite email failed after staff creation:', emailError);
        return { ...finalAdmin, inviteEmailSent: false };
    }
}

function assertNotSuperAdmin(admin) {
    if (admin.role === 'super_admin') {
        const error = new Error('Super admin accounts cannot be modified here');
        error.status = 403;
        throw error;
    }
}

export async function updateAdminStatus(publicId, status, requestingAdmin) {
    if (!['active', 'suspended'].includes(status)) {
        const error = new Error('Status must be active or suspended');
        error.status = 400;
        throw error;
    }

    const target = await staffModel.findAdminByPublicId(publicId);
    if (!target) {
        const error = new Error('Staff member not found');
        error.status = 404;
        throw error;
    }
    assertNotSuperAdmin(target);

    const updated = await staffModel.updateAdminStatus(publicId, status);

    await logActivity(pool, {
        entity_type: 'admin',
        entity_id: updated.admin_id,
        actor_type: 'Admin',
        actor_id: requestingAdmin.admin_id,
        actor_name: requestingAdmin.full_name,
        action: status === 'suspended' ? 'suspend_staff' : 'reactivate_staff',
        action_detail: `${status === 'suspended' ? 'Suspended' : 'Reactivated'} staff account for ${target.full_name}`,
    });

    return attachPermissions(updated);
}

export async function updateAdminPermissions(publicId, sections, requestingAdmin) {
    const invalidSection = sections.find(s => !ALLOWED_SECTIONS.includes(s));
    if (invalidSection) {
        const error = new Error(`Unknown section: ${invalidSection}`);
        error.status = 400;
        throw error;
    }

    const target = await staffModel.findAdminByPublicId(publicId);
    if (!target) {
        const error = new Error('Staff member not found');
        error.status = 404;
        throw error;
    }
    assertNotSuperAdmin(target);

    await staffModel.replacePermissions(target.admin_id, sections, requestingAdmin.admin_id);

    await logActivity(pool, {
        entity_type: 'admin',
        entity_id: target.admin_id,
        actor_type: 'Admin',
        actor_id: requestingAdmin.admin_id,
        actor_name: requestingAdmin.full_name,
        action: 'update_staff_permissions',
        action_detail: `Updated section access for ${target.full_name}: ${sections.join(', ') || 'none'}`,
    });

    return attachPermissions(await staffModel.findAdminByPublicId(publicId));
}

// => Only valid while the staff member has never completed setup (password_set === false).
// => Once they've set a real password, use resetPassword instead.
export async function resendInvite(publicId, requestingAdmin) {
    const target = await staffModel.findAdminByPublicId(publicId);
    if (!target) {
        const error = new Error('Staff member not found');
        error.status = 404;
        throw error;
    }
    assertNotSuperAdmin(target);

    if (target.password_set) {
        const error = new Error('This staff member has already set a password. Use Reset Password instead.');
        error.status = 400;
        throw error;
    }

    await staffModel.invalidateInviteTokens(target.admin_id);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await staffModel.createInviteToken(target.admin_id, rawToken, expiresAt, 'invite');

    await sendStaffInviteEmail({ toEmail: target.email, fullName: target.full_name, rawToken });

    await logActivity(pool, {
        entity_type: 'admin',
        entity_id: target.admin_id,
        actor_type: 'Admin',
        actor_id: requestingAdmin.admin_id,
        actor_name: requestingAdmin.full_name,
        action: 'resend_staff_invite',
        action_detail: `Resent invite email to ${target.full_name} (${target.email})`,
    });

    return { message: 'Invite resent' };
}

// => Only valid once the staff member has already completed setup (password_set === true).
// => Their current password keeps working until they follow the link.
export async function resetAdminPassword(publicId, requestingAdmin) {
    const target = await staffModel.findAdminByPublicId(publicId);
    if (!target) {
        const error = new Error('Staff member not found');
        error.status = 404;
        throw error;
    }
    assertNotSuperAdmin(target);

    if (!target.password_set) {
        const error = new Error('This staff member has not completed their invite yet. Use Resend Invite instead.');
        error.status = 400;
        throw error;
    }

    await staffModel.invalidateInviteTokens(target.admin_id);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await staffModel.createInviteToken(target.admin_id, rawToken, expiresAt, 'reset');

    await sendStaffResetPasswordEmail({ toEmail: target.email, fullName: target.full_name, rawToken });

    await logActivity(pool, {
        entity_type: 'admin',
        entity_id: target.admin_id,
        actor_type: 'Admin',
        actor_id: requestingAdmin.admin_id,
        actor_name: requestingAdmin.full_name,
        action: 'reset_staff_password',
        action_detail: `Triggered a password reset for ${target.full_name} (${target.email})`,
    });

    return { message: 'Password reset email sent' };
}

// => Paginated activity log for the target staff member as an actor - what
// => THEY'VE done, not what's been done to their account. Mirrors the
// => pattern Account.jsx already uses for the logged-in admin's own history.
export async function getAdminLogs(publicId, page = 1) {
    const target = await staffModel.findAdminByPublicId(publicId);
    if (!target || target.role === 'super_admin') {
        const error = new Error('Staff member not found');
        error.status = 404;
        throw error;
    }

    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const { logs, total } = await getActivityLogsByActorPaginated(pool, 'Admin', target.admin_id, safePage, PAGE_SIZE);

    return {
        logs,
        page: safePage,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        total,
    };
}