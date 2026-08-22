// models/Staff/staffModel.js

import { pool, sql } from '../../config/db.js';
import crypto from 'crypto';

// => Fetches a page of admins, newest first, search matches full_name or email.
// => password_hash is never selected here - it should never leave the model layer.
// => "admin" naming below matches the DB schema (admins table, admin_id column) -
// => this is intentional, the Admin -> Staff rename is UI-display-only.
export async function findAllAdmins({ limit, offset, search }) {
    // => super_admin is never listed here - it's provisioned manually in Neon
    // => and has no page of its own to manage or suspend
    if (search) {
        const like = `%${search}%`;
        const result = await sql`
            SELECT admin_id, public_id, full_name, email, role, status, password_set,
                   is_night_mode, created_at, updated_at, last_login_at, remarks
            FROM admins
            WHERE role != 'super_admin'
              AND (full_name ILIKE ${like} OR email ILIKE ${like})
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;
        return result.rows;
    }

    const result = await sql`
        SELECT admin_id, public_id, full_name, email, role, status, password_set,
               is_night_mode, created_at, updated_at, last_login_at, remarks
        FROM admins
        WHERE role != 'super_admin'
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
    `;
    return result.rows;
}

// => Total count for pagination - mirrors the same search filter and
// => super_admin exclusion as findAllAdmins
export async function countAdmins({ search }) {
    if (search) {
        const like = `%${search}%`;
        const result = await sql`
            SELECT COUNT(*)::int AS total
            FROM admins
            WHERE role != 'super_admin'
              AND (full_name ILIKE ${like} OR email ILIKE ${like})
        `;
        return result.rows[0].total;
    }

    const result = await sql`
        SELECT COUNT(*)::int AS total FROM admins WHERE role != 'super_admin'
    `;
    return result.rows[0].total;
}

// => Detail lookup by public_id - used for the detail page and every mutation below
export async function findAdminByPublicId(publicId) {
    const result = await sql`
        SELECT admin_id, public_id, full_name, email, role, status, password_set,
               is_night_mode, created_at, updated_at, last_login_at, remarks
        FROM admins
        WHERE public_id = ${publicId}
    `;
    return result.rows[0] || null;
}

// => Internal lookup by email - used to enforce uniqueness on creation
export async function findAdminByEmail(email) {
    const result = await sql`
        SELECT admin_id, email FROM admins WHERE email = ${email}
    `;
    return result.rows[0] || null;
}

// => Creates a regular admin (displayed as "Staff" in the UI) with a locked,
// => unusable password_hash - the account stays inaccessible until the invite
// => link is used to set a real password. password_set is explicitly false
// => here, overriding the table's DEFAULT true (that default exists only to
// => correctly mark pre-existing rows as active).
export async function createAdmin({ fullName, email, lockedHash }) {
    // => lockedHash restored - was hardcoded to NULL before, which violates
    // => the NOT NULL constraint on password_hash and broke account creation
    const result = await sql`
        INSERT INTO admins (full_name, email, password_hash, role, status, password_set)
        VALUES (${fullName}, ${email}, ${lockedHash}, 'staff', 'active', false)
        RETURNING admin_id, public_id, full_name, email, role, status, password_set, created_at
    `;
    return result.rows[0];
}

// => Toggles between active and suspended - never a hard delete, since activity
// => logs and other records reference admin_id
export async function updateAdminStatus(publicId, status) {
    const result = await sql`
        UPDATE admins
        SET status = ${status}
        WHERE public_id = ${publicId}
        RETURNING admin_id, public_id, full_name, email, role, status, password_set
    `;
    return result.rows[0] || null;
}

// => Updates the editable profile fields (full name, email) for a staff
// => member. Status and section access are updated through their own
// => dedicated functions above, not through this one.
export async function updateAdminProfile(publicId, { fullName, email }) {
    const result = await sql`
        UPDATE admins
        SET full_name = ${fullName}, email = ${email}, updated_at = NOW()
        WHERE public_id = ${publicId}
        RETURNING admin_id, public_id, full_name, email, role, status, password_set,
                  is_night_mode, created_at, updated_at, last_login_at, remarks
    `;
    return result.rows[0] || null;
}

// => Section keys currently granted to this admin
export async function getPermissionsByAdminId(adminId) {
    const result = await sql`
        SELECT section_key
        FROM admin_section_permissions
        WHERE admin_id = ${adminId}
        ORDER BY section_key
    `;
    return result.rows.map(row => row.section_key);
}

// => Replaces the full permission set for an admin in one transaction -
// => simpler and safer than diffing which checkboxes changed on the frontend
export async function replacePermissions(adminId, sectionKeys, grantedBy) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            'DELETE FROM admin_section_permissions WHERE admin_id = $1',
            [adminId]
        );

        for (const sectionKey of sectionKeys) {
            await client.query(
                `INSERT INTO admin_section_permissions (admin_id, section_key, granted_by)
                 VALUES ($1, $2, $3)`,
                [adminId, sectionKey, grantedBy]
            );
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// => NOT part of the Admin -> Staff rename - these functions are shared with
// => the separate invite-verification flow behind /api/admin-invite/:token
// => (SetAdminPassword.jsx's backend), which lives in files not covered here.
// => Left completely untouched, names and all, to avoid breaking that flow blind.

// => Stores a hashed invite/reset token - the raw token only ever exists in
// => the email link, never in the database, same pattern as
// => password_setup_tokens for students. purpose distinguishes a first-time
// => invite from a super_admin-triggered password reset, though both are
// => consumed by the exact same completeInvite flow.
export async function createInviteToken(adminId, rawToken, expiresAt, purpose = 'invite') {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await sql`
        INSERT INTO admin_password_setup_tokens (admin_id, token_hash, purpose, expires_at)
        VALUES (${adminId}, ${tokenHash}, ${purpose}, ${expiresAt})
    `;
}

// => Looks up a still-valid, unused invite/reset token and the admin it belongs to
export async function findValidInviteToken(rawToken) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const result = await sql`
        SELECT t.token_id, t.admin_id, t.expires_at, t.used_at, t.purpose,
               a.full_name, a.email, a.status
        FROM admin_password_setup_tokens t
        JOIN admins a ON a.admin_id = t.admin_id
        WHERE t.token_hash = ${tokenHash}
          AND t.used_at IS NULL
          AND t.expires_at > NOW()
    `;
    return result.rows[0] || null;
}

// => Marks the token as used so it can't be replayed
export async function markInviteTokenUsed(tokenId) {
    await sql`
        UPDATE admin_password_setup_tokens
        SET used_at = NOW()
        WHERE token_id = ${tokenId}
    `;
}

// => Invalidates any outstanding invite/reset tokens for this admin before issuing a new one
export async function invalidateInviteTokens(adminId) {
    await sql`
        UPDATE admin_password_setup_tokens
        SET used_at = NOW()
        WHERE admin_id = ${adminId} AND used_at IS NULL
    `;
}

// => Sets the real password once the invite or reset is completed, and flips
// => password_set to true so the admin's detail page shows Reset Password
// => instead of Resend Invite from here on
export async function setAdminPassword(adminId, passwordHash) {
    await sql`
        UPDATE admins
        SET password_hash = ${passwordHash}, password_set = true
        WHERE admin_id = ${adminId}
    `;
}