import React, { useEffect, useState } from 'react';
// => axiosAdmin attaches CSRF token and handles 401s centrally, same as every other admin request
import axiosAdmin from '../../utils/axiosAdmin.js';
import { useNavigate, Outlet } from 'react-router-dom';
import Sidebar from '../../components/SideBar/SideBar.jsx';
import './Dashboard.css';

export default function Dashboard() {
    const navigate = useNavigate();

    // => Holds the logged-in admin's info fetched from /api/admin-auth/me
    const [admin, setAdmin] = useState(null);

    // => Tracks whether the auth check is still in progress
    // => Stays true until we confirm the session is valid or not
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
        const verifySession = async () => {
            try {
                // => Hits the protected /me route to confirm the admin_token cookie is valid
                // => axiosAdmin already sends withCredentials, no need to set it here
                const res = await axiosAdmin.get('/api/admin-auth/me');
                setAdmin(res.data.admin);
            } catch {
                // => axiosAdmin's response interceptor already clears sessionStorage and redirects on 401
                // => this catch just needs to stop the checking spinner, navigate('/') is a safe fallback
                // => for non-401 errors (e.g. network failure) where the interceptor doesn't fire
                navigate('/');
            } finally {
                setIsChecking(false);
            }
        };

        verifySession();
    }, [navigate]);

    // => Show nothing while verifying session to avoid a flash of the dashboard
    if (isChecking) return null;

    return (
        <div className="dashboard">
            {/* => Pass admin identity down to the sidebar for display */}
            <Sidebar
                adminName={admin?.full_name}
                adminRole={admin?.role}
                adminSections={admin?.sections || []}
            />

            <div className="main-content">
                {/* => Outlet renders the active child route (e.g. /dashboard/enrollments) */}
                {/* => When no child route is active, DashboardHome renders as the index */}
                {/* => context makes the logged-in admin available to any page via
                     useOutletContext() - Admins.jsx and AdminDetail use it to redirect
                     non-super-admins away from this route */}
                <Outlet context={{ admin }} />
            </div>
        </div>
    );
}