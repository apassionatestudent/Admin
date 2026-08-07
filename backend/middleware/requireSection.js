// middleware/requireSection.js

// => Restricts a route to admins who have been granted this specific
// => section, or who are super_admin (which implicitly has every section -
// => see protectAdmin, where req.admin.sections is null for super_admin).
// => Must be used AFTER protectAdmin in the middleware chain, since it
// => depends on req.admin.sections already being populated.
export const requireSection = (sectionKey) => (req, res, next) => {
    if (req.admin?.role === 'super_admin') {
        return next();
    }

    if (req.admin?.sections?.includes(sectionKey)) {
        return next();
    }

    return res.status(403).json({ error: 'You do not have access to this section.' });
};