import { sql } from '../config/db.js';

export const Admin = {

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