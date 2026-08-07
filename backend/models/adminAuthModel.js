import { sql } from '../config/db.js';

export const Admin = {

    // => Fetches only the current status column by admin_id - used on every
    // => protected request so a suspension takes effect on the next request,
    // => not just on the next login. Kept to a single column for speed since
    // => this runs per-request, not once per session.
    findStatusById: async (admin_id) => {
        const result = await sql`
            SELECT status FROM admins
            WHERE admin_id = ${admin_id}
            LIMIT 1
        `;
        return result.rows[0]?.status || null;
    },

    // => Find an admin by their email address (used during login)
    // => .rows is required because db.js uses fullResults: true which wraps results in { rows: [...] }
    findByEmail: async (email) => {
        const result = await sql`
            SELECT * FROM admins
            WHERE email = ${email}
            LIMIT 1
        `;
        return result.rows[0] || null;
    },

    // => Update last_login_at to now() whenever an admin successfully logs in
    updateLastLogin: async (admin_id) => {
        await sql`
            UPDATE admins
            SET last_login_at = NOW()
            WHERE admin_id = ${admin_id}
        `;
    },
};