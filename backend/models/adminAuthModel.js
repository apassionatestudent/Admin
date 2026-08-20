import { sql } from '../config/db.js';

// => Stricter than the student side, since a compromised admin account has
//    system-wide power: 3 failed attempts locks the account for 15 minutes
const MAX_FAILED_ATTEMPTS = 3;

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

    // => Atomically increments failed_login_attempts and sets locked_until
    // => in the same query if the new count crosses the threshold, avoids
    // => a read-then-write race between two near-simultaneous bad attempts
    // => RETURNING lets the controller know immediately whether this exact
    // => attempt is the one that triggered the lock
    incrementFailedAttempts: async (admin_id) => {
        const result = await sql`
            UPDATE admins
            SET failed_login_attempts = failed_login_attempts + 1,
                locked_until = CASE
                    WHEN failed_login_attempts + 1 >= ${MAX_FAILED_ATTEMPTS}
                    THEN NOW() + INTERVAL '15 minutes'
                    ELSE locked_until
                END
            WHERE admin_id = ${admin_id}
            RETURNING failed_login_attempts, locked_until
        `;
        return result.rows[0];
    },

    // => Resets both fields on a successful login, clearing any prior lock
    resetFailedAttempts: async (admin_id) => {
        await sql`
            UPDATE admins
            SET failed_login_attempts = 0,
                locked_until = NULL
            WHERE admin_id = ${admin_id}
        `;
    },
};