import React, { useEffect, useState } from 'react';
// => axiosAdmin attaches the CSRF token and handles 401s centrally, same as
// => every other admin request
import axiosAdmin from '../../utils/axiosAdmin.js';

// => Crude PNG icons - swap these filenames to match what's actually in
// => src/assets/icons. Paths are relative to this file's location at
// => src/pages/Dashboard/DashboardHome.jsx
import enrollmentsIcon    from '../../assets/icons/enrollmentsDashboard.png';
import batchesIcon        from '../../assets/icons/batchesDashboard.png';
import supportTicketsIcon from '../../assets/icons/supportTicketsDashboard.png';
import classSessionsIcon  from '../../assets/icons/classSessionsDashboard.png';

import './DashboardHome.css';

// => Default landing page when admin hits /dashboard
export default function DashboardHome() {
    // => Holds the shaped summary object returned by GET /api/admin/dashboard/summary
    const [summary, setSummary] = useState(null);

    // => Tracks whether the initial fetch is still in progress
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchSummary = async () => {
            try {
                const res = await axiosAdmin.get('/api/admin/dashboard/summary');
                setSummary(res.data);
            } catch (error) {
                // => axiosAdmin's interceptor already handles 401 redirects -
                // => this just needs to stop the loading state on any other failure
                console.error('Failed to load dashboard summary:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchSummary();
    }, []);

    if (isLoading) return null;

    // => summary.supportTickets is null when the logged-in admin has no
    // => 'support-tickets' section access - see dashboardService.js
    const showSupportTickets = summary?.supportTickets !== null && summary?.supportTickets !== undefined;

    return (
        <main className="dashboard-home">
            {/* => Title now uses dashboard-home__title, matching Enrollments
               page's header styling for visual consistency */}
            <h2 className="dashboard-home__title">Dashboard</h2>
            <p className="dashboard-home__subtitle">Quick overview of today's operations.</p>

            <div className="dashboard-home__grid">

                {/* => Enrollments card: pending, needs clarification, reviewed */}
                <div className="dashboard-home__card">
                    <div className="dashboard-home__card-header">
                        <img src={enrollmentsIcon} alt="" className="dashboard-home__icon" />
                        <h3>Enrollments</h3>
                    </div>
                    {/* => card-body centers these rows vertically when this card sits
                       next to a taller one in the same grid row */}
                    <div className="dashboard-home__card-body">
                        <div className="dashboard-home__stat-row">
                            <span className="dashboard-home__stat-label">Pending</span>
                            <span className="dashboard-home__stat-value">{summary.enrollments.pending}</span>
                        </div>
                        <div className="dashboard-home__stat-row">
                            <span className="dashboard-home__stat-label">Needs Clarification</span>
                            <span className="dashboard-home__stat-value">{summary.enrollments.needsClarification}</span>
                        </div>
                        <div className="dashboard-home__stat-row">
                            <span className="dashboard-home__stat-label">Reviewed</span>
                            <span className="dashboard-home__stat-value">{summary.enrollments.reviewed}</span>
                        </div>
                    </div>
                </div>

                {/* => Batches card: pending, ongoing (TESDA + SHS combined) */}
                <div className="dashboard-home__card">
                    <div className="dashboard-home__card-header">
                        <img src={batchesIcon} alt="" className="dashboard-home__icon" />
                        <h3>Batches</h3>
                    </div>
                    {/* => card-body centers these rows vertically when this card sits
                       next to a taller one in the same grid row */}
                    <div className="dashboard-home__card-body">
                        <div className="dashboard-home__stat-row">
                            <span className="dashboard-home__stat-label">Pending</span>
                            <span className="dashboard-home__stat-value">{summary.batches.pending}</span>
                        </div>
                        <div className="dashboard-home__stat-row">
                            <span className="dashboard-home__stat-label">Ongoing</span>
                            <span className="dashboard-home__stat-value">{summary.batches.ongoing}</span>
                        </div>
                    </div>
                </div>

                {/* => Support Tickets card: only rendered if the admin has section access */}
                {showSupportTickets && (
                    <div className="dashboard-home__card">
                        <div className="dashboard-home__card-header">
                            <img src={supportTicketsIcon} alt="" className="dashboard-home__icon" />
                            <h3>Support Tickets</h3>
                        </div>
                        {/* => card-body centers these rows vertically when this card sits
                           next to a taller one in the same grid row */}
                        <div className="dashboard-home__card-body">
                            <div className="dashboard-home__stat-row">
                                <span className="dashboard-home__stat-label">Open</span>
                                <span className="dashboard-home__stat-value">{summary.supportTickets.open}</span>
                            </div>
                            <div className="dashboard-home__stat-row">
                                <span className="dashboard-home__stat-label">In Progress</span>
                                <span className="dashboard-home__stat-value">{summary.supportTickets.inProgress}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* => Class Sessions Today card: single number, no TESDA/SHS split */}
                <div className="dashboard-home__card dashboard-home__card--single">
                    <div className="dashboard-home__card-header">
                        <img src={classSessionsIcon} alt="" className="dashboard-home__icon" />
                        <h3>Class Sessions Today</h3>
                    </div>
                    {/* => card-body centers this row vertically when this card sits
                       next to a taller one in the same grid row */}
                    <div className="dashboard-home__card-body">
                        <div className="dashboard-home__stat-row dashboard-home__stat-row--single">
                            <span className="dashboard-home__stat-value dashboard-home__stat-value--large">
                                {summary.classSessionsToday}
                            </span>
                        </div>
                    </div>
                </div>

            </div>
        </main>
    );
}