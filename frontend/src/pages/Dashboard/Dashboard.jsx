import React, { useEffect, useState } from 'react';
import axios from 'axios';
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
                const res = await axios.get('/api/admin-auth/me', {
                    withCredentials: true,
                });
                setAdmin(res.data.admin);
            } catch {
                // => Token is missing, expired, or invalid - send them back to login
                sessionStorage.removeItem('isAdminLoggedIn');
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
            />

            <div className="main-content">
                {/* => Outlet renders the active child route (e.g. /dashboard/enrollments) */}
                {/* => When no child route is active, DashboardHome renders as the index */}
                <Outlet />
            </div>
        </div>
    );
}