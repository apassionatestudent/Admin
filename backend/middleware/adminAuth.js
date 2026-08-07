import jwt from 'jsonwebtoken';
import { Admin } from '../models/adminAuthModel.js';
import { getPermissionsByAdminId } from '../models/Staff/staffModel.js';

// => Protects routes that require a logged-in admin
// => Checks the admin_token cookie (separate from the student token)
export const protectAdmin = async (req, res, next) => {
    const token = req.cookies.admin_token || req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'No token provided. Please log in.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_ADMIN_SECRET);

        // => decoded.status is only a snapshot from login - checking it alone
        // => means a suspension doesn't take effect until the token expires.
        // => Re-checking the live DB value here makes suspension effective
        // => on the very next request instead.
        const currentStatus = await Admin.findStatusById(decoded.admin_id);

        if (!currentStatus || currentStatus !== 'active') {
            return res.status(403).json({ error: 'Your account has been suspended. Please contact the system owner.' });
        }

        // => Section access can be changed by a super_admin at any time, so
        // => it's re-fetched live here rather than trusted from the JWT -
        // => same reasoning as the status check above. super_admin has no
        // => rows in admin_section_permissions and implicitly has every
        // => section, represented here as null rather than an empty array
        // => so requireSection below can tell "no sections" apart from "all".
        const sections = decoded.role === 'super_admin'
            ? null
            : await getPermissionsByAdminId(decoded.admin_id);

        // => Attach decoded admin info to req so downstream handlers can use it,
        // => with status/sections overwritten by live values in case either
        // => drifted from what was baked into the token at login
        req.admin = { ...decoded, status: currentStatus, sections };
        next();

    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
    }
};

// => Restricts a route to super_admin only
// => Must be used AFTER protectAdmin in the middleware chain
export const requireSuperAdmin = (req, res, next) => {
    if (req.admin?.role !== 'super_admin') {
        return res.status(403).json({ error: 'Access denied. Super admin only.' });
    }
    next();
};