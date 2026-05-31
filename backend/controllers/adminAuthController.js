import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Admin } from '../models/adminModel.js';

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
    console.log('Login attempt:', req.body); // => temporary debug line, remove after confirming
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Please provide an email and password' });
    }

    try {
        // => Look up the admin by email
        const admin = await Admin.findByEmail(email);

        // => temporary debug lines, remove after fixing
        console.log('Admin found:', admin);
        console.log('Password hash in DB:', admin?.password_hash);
        console.log('Password from request:', password);
        const testMatch = await bcrypt.compare(password, admin?.password_hash);
        console.log('bcrypt.compare result:', testMatch);
        if (!admin) {
            // => Intentionally vague: don't reveal whether the email exists
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // => Reject if the admin account is suspended
        if (admin.status !== 'active') {
            return res.status(403).json({ message: 'Your account has been suspended. Please contact the system owner.' });
        }

        // => Compare submitted password against stored hash
        const isMatch = await bcrypt.compare(password, admin.password_hash);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // => Update last_login_at on successful login
        await Admin.updateLastLogin(admin.admin_id);

        const token = generateAdminToken(admin);
        res.cookie('admin_token', token, cookieOptions); // => separate cookie name from student token

        return res.status(200).json({
            admin: {
                admin_id:  admin.admin_id,
                email:     admin.email,
                full_name: admin.full_name,
                role:      admin.role,
            }
        });

    } catch (error) {
        console.error('Admin login error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
};

// => POST /api/admin-auth/logout
export const logoutAdmin = (req, res) => {
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