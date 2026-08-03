// => Handles all direct DB access for the logged-in admin's own account
import { pool } from '../../config/db.js';

// => Fetch a single admin's account info by admin_id
export async function findAdminById(adminId) {
    const result = await pool.query(
        `SELECT admin_id, full_name, email, role, status, is_night_mode, created_at, updated_at, last_login_at
         FROM admins
         WHERE admin_id = $1`,
        [adminId]
    );
    return result.rows[0] || null;
}

// => Fetch password_hash separately, never returned alongside profile data
export async function findPasswordHashById(adminId) {
    const result = await pool.query(
        `SELECT password_hash FROM admins WHERE admin_id = $1`,
        [adminId]
    );
    return result.rows[0] || null;
}

// => Update only full_name
export async function updateFullName(adminId, fullName) {
    await pool.query(
        `UPDATE admins SET full_name = $1, updated_at = now() WHERE admin_id = $2`,
        [fullName, adminId]
    );
}

// => Toggle day/night theme preference
export async function updateNightMode(adminId, isNightMode) {
    await pool.query(
        `UPDATE admins SET is_night_mode = $1, updated_at = now() WHERE admin_id = $2`,
        [isNightMode, adminId]
    );
}

// => Update password hash after verifying current password in the service layer
export async function updatePasswordHash(adminId, newPasswordHash) {
    await pool.query(
        `UPDATE admins SET password_hash = $1, updated_at = now() WHERE admin_id = $2`,
        [newPasswordHash, adminId]
    );
}

