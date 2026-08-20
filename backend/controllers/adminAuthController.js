// => admin/controllers/adminAuthController.js

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Admin } from '../models/adminAuthModel.js';
// => generateCsrfToken and invalidateCsrfToken live in middleware
// => but are called here since issuing/revoking tokens is a controller responsibility
import { generateCsrfToken, invalidateCsrfToken } from '../middleware/adminCsrf.js';
// => pool is needed here since logActivity takes pool as its first argument
import { pool } from '../config/db.js';
import { logActivity } from '../models/adminActivityLogModel.js';

// => Cookie options for security (mirrors studentAuthController pattern)
const cookieOptions = {
    httpOnly: true,   // => not accessible by client-side JS
    secure: process.env.NODE_ENV === 'production', // => HTTPS only in production
    sameSite: 'Strict', // => CSRF protection
    maxAge: 8 * 60 * 60 * 1000, // => 8 hours; no "remember me" for admins - security measure
};

// => Generates a JWT carrying essential admin identity info
// => Includes role so middleware can enforce super_admin-only routes later
const generateAdminToken = (admin) => {
    return jwt.sign(
        {
            admin_id:  admin.admin_id,
            email:     admin.email,
            full_name: admin.full_name,
            role:      admin.role,   // => 'admin' or 'super_admin'
            status:    admin.status,
        },
        process.env.JWT_ADMIN_SECRET, // => separate secret from the student JWT
        { expiresIn: '8h' }
    );
};

// => POST /api/admin-auth/login
export const loginAdmin = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Please provide an email and password' });
    }

    try {
        // => Look up the admin by email
        const admin = await Admin.findByEmail(email);

        if (!admin) {
            // => Intentionally vague: don't reveal whether the email exists
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // => Check lockout before anything else about this account leaks
        // => Wording is intentionally identical to ordinary rate-limit
        // => wording, so a locked real account looks the same as IP
        // => throttling on a fake one, closing the account-enumeration gap
        if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
            return res.status(429).json({
                message: 'Too many requests. Please wait before trying again.',
                lockedUntil: admin.locked_until,
            });
        }

        // => Reject if the admin account is suspended
        if (admin.status !== 'active') {
            return res.status(403).json({ message: 'Your account has been suspended. Please contact the system owner.' });
        }

        // => password_hash is NULL until the invite link is used to set a real
        // => password - bcrypt.compare() throws on a null hash rather than
        // => safely returning false, so this must be checked first
        if (!admin.password_hash) {
            return res.status(403).json({ message: 'Account setup not complete. Please check your email for the invite link.' });
        }

        // => Compare submitted password against stored hash
        const isMatch = await bcrypt.compare(password, admin.password_hash);
        if (!isMatch) {
            // => 3 failed attempts locks the account for 15 minutes
            const updated = await Admin.incrementFailedAttempts(admin.admin_id);

            if (updated.locked_until) {
                // => This exact attempt is the one that crossed the threshold
                await logActivity(pool, {
                    entity_type: 'admin',
                    entity_id: admin.admin_id,
                    actor_type: 'Staff',
                    actor_id: admin.admin_id,
                    actor_name: admin.full_name,
                    action: 'ACCOUNT_LOCKED',
                    action_detail: `${admin.full_name} locked out after ${updated.failed_login_attempts} failed login attempts.`,
                });

                return res.status(429).json({
                    message: 'Too many requests. Please wait before trying again.',
                    lockedUntil: updated.locked_until,
                });
            }

            // => Not locked yet, just an ordinary failed attempt
            await logActivity(pool, {
                entity_type: 'admin',
                entity_id: admin.admin_id,
                actor_type: 'Staff',
                actor_id: admin.admin_id,
                actor_name: admin.full_name,
                action: 'LOGIN_FAILED',
                action_detail: `${admin.full_name} entered an incorrect password (attempt ${updated.failed_login_attempts} of 3).`,
            });

            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // => Successful login clears the failed attempt counter and any lock
        await Admin.resetFailedAttempts(admin.admin_id);

        // => Update last_login_at on successful login
        await Admin.updateLastLogin(admin.admin_id);

        // => LOGIN is a pure system event with no specific entity attached,
        //    so entity_type/entity_id are left null (see adminActivityLogModel.js)
        await logActivity(pool, {
            entity_type: null,
            entity_id: null,
            actor_type: 'Staff',
            actor_id: admin.admin_id,
            actor_name: admin.full_name,
            action: 'LOGIN',
            action_detail: `${admin.full_name} (${admin.role}) logged in.`,
        });

        const token = generateAdminToken(admin);
        res.cookie('admin_token', token, cookieOptions); // => separate cookie name from student token

        // => Generate CSRF token on login and send it to the frontend
        // => Frontend must store this in memory and include it as x-csrf-token on all mutations
        const csrfToken = generateCsrfToken();

        return res.status(200).json({
            admin: {
                admin_id:  admin.admin_id,
                email:     admin.email,
                full_name: admin.full_name,
                role:      admin.role,
            },
            csrfToken,
        });

    } catch (error) {
        // => Safe: logs only the error object, never user-submitted data
        console.error('Admin login error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
};

// => POST /api/admin-auth/logout
export const logoutAdmin = (req, res) => {
    // => Invalidate the CSRF token so it can't be reused after logout
    const csrfToken = req.headers['x-csrf-token'];
    if (csrfToken) {
        invalidateCsrfToken(csrfToken);
    }

    // => Clears the admin cookie
    res.cookie('admin_token', '', { ...cookieOptions, maxAge: 1 });
    return res.status(200).json({ message: 'Logged out successfully' });
};

// => GET /api/admin-auth/me
// => Returns the currently logged-in admin's info from the decoded JWT
export const getMe = (req, res) => {
    // => req.admin is attached by the protectAdmin middleware
    return res.status(200).json({ admin: req.admin });
};