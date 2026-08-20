// components/RequireSection/requireSection.jsx

import React from 'react';
import { Navigate, useOutletContext } from 'react-router-dom';

// => Wraps a protected dashboard route and enforces the same section-access
// => rule as the backend's requireSection middleware. This is a UX guard only,
// => the real boundary is enforced server-side on every route.
// => super_admin always passes, matching protectAdmin where sections is null
// => and implicitly means "every section" for that role.
// => Reusing this for the Staff routes works too: "staff" is never in
// => ALLOWED_SECTIONS on the backend, so a non-super_admin's sections array
// => can never contain it, meaning it naturally blocks them same as Sidebar.jsx does.
const RequireSection = ({ section, children }) => {
    const { admin } = useOutletContext();

    // => admin is still resolving on first render, render nothing rather than
    // => firing a redirect before Dashboard.jsx's own session check settles
    if (!admin) return null;

    const hasAccess = admin.role === 'super_admin' || (admin.sections || []).includes(section);

    if (!hasAccess) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
};

export default RequireSection;