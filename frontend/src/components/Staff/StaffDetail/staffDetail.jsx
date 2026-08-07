import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import toast from 'react-hot-toast';
import BackButton from '../../BackButton/BackButton.jsx';
import LoadingState from '../../LoadingState/loadingState.jsx';
import axiosAdmin from '../../../utils/axiosAdmin.js';
import './staffDetail.css';

import ResendIcon from '../../../assets/icons/resend.png';

const SECTION_OPTIONS = [
    { key: 'enrollments', label: 'Enrollments' },
    { key: 'classes', label: 'Classes' },
    { key: 'support-tickets', label: 'Support Tickets' },
    { key: 'students', label: 'Students' },
    { key: 'reports', label: 'Reports' },
    { key: 'payments', label: 'Payments' },
    { key: 'courses', label: 'Courses' },
    { key: 'pages', label: 'Pages' },
    { key: 'logs', label: 'Logs' },
    { key: 'chatbots', label: 'Chatbots' },
];

// => Same date formatting convention as Classes.jsx's formatDate
const formatLogDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-PH', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
    });
};

export default function StaffDetail() {
    const { publicId } = useParams();
    const navigate = useNavigate();
    const { admin: currentAdmin } = useOutletContext();

    const [target, setTarget] = useState(null);
    const [sections, setSections] = useState([]);
    const [isSaving, setIsSaving] = useState(false);

    const [logs, setLogs] = useState([]);
    const [logsPage, setLogsPage] = useState(1);
    const [logsTotalPages, setLogsTotalPages] = useState(1);
    const [logsLoading, setLogsLoading] = useState(true);

    useEffect(() => {
        if (currentAdmin && currentAdmin.role !== 'super_admin') {
            navigate('/dashboard');
        }
    }, [currentAdmin, navigate]);

    // => Endpoint and URL path stay /api/admin/admins and /dashboard/admins on
    // => purpose - display-only rename, backend routes and DB schema are untouched
    const fetchStaffMember = useCallback(async () => {
        try {
            const res = await axiosAdmin.get(`/api/admin/admins/${publicId}`);
            setTarget(res.data);
            setSections(res.data.sections);
        } catch {
            toast.error('Failed to load staff member');
            navigate('/dashboard/staff');
        }
    }, [publicId, navigate]);

    const fetchLogs = useCallback(async () => {
        setLogsLoading(true);
        try {
            const res = await axiosAdmin.get(`/api/admin/admins/${publicId}/logs`, {
                params: { page: logsPage },
            });
            setLogs(res.data.logs);
            setLogsTotalPages(res.data.totalPages);
        } catch {
            toast.error('Failed to load activity logs');
        } finally {
            setLogsLoading(false);
        }
    }, [publicId, logsPage]);

    useEffect(() => {
        fetchStaffMember();
    }, [fetchStaffMember]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const toggleSection = (key) => {
        setSections(prev =>
            prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]
        );
    };

    const handleSavePermissions = async () => {
        setIsSaving(true);
        try {
            await axiosAdmin.patch(`/api/admin/admins/${publicId}/permissions`, { sections });
            toast.success('Section access updated');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update permissions');
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleStatus = async () => {
        const nextStatus = target.status === 'active' ? 'suspended' : 'active';
        try {
            const res = await axiosAdmin.patch(`/api/admin/admins/${publicId}/status`, { status: nextStatus });
            setTarget(res.data);
            toast.success(nextStatus === 'suspended' ? 'Staff suspended' : 'Staff reactivated');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update status');
        }
    };

    const handleResendInvite = async () => {
        try {
            await axiosAdmin.post(`/api/admin/admins/${publicId}/resend-invite`);
            toast.success('Invite email resent');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to resend invite');
        }
    };

    const handleResetPassword = async () => {
        try {
            await axiosAdmin.post(`/api/admin/admins/${publicId}/reset-password`);
            toast.success('Password reset email sent');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to reset password');
        }
    };

    if (!target) {
        return (
            <main className="adm-admin-detail">
                <LoadingState message="Loading staff member..." />
            </main>
        );
    }

    const selectedCount = sections.length;

    return (
        <main className="adm-admin-detail">
            <BackButton destination="Staff" onClick={() => navigate('/dashboard/staff')} />

            <div className="adm-admin-detail-card">
                <div className="adm-admin-detail-header">
                    <div className="adm-admin-detail-avatar">
                        {target.full_name?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="adm-admin-detail-heading">
                        <div className="adm-admin-detail-name-row">
                            <h2>{target.full_name}</h2>
                            <span className={`adm-admin-detail-status adm-admin-detail-status--${target.status}`}>
                                {target.status}
                            </span>
                            {!target.password_set && (
                                <span className="adm-admin-detail-status adm-admin-detail-status--pending">
                                    Invite Pending
                                </span>
                            )}
                        </div>
                        <p className="adm-admin-detail-email">{target.email}</p>
                    </div>
                </div>

                <div className="adm-admin-detail-actions">
                    <button
                        className={`adm-admin-detail-btn ${target.status === 'active' ? 'adm-admin-detail-btn--danger' : 'adm-admin-detail-btn--success'}`}
                        onClick={handleToggleStatus}
                    >
                        {target.status === 'active' ? 'Suspend Staff' : 'Reactivate Staff'}
                    </button>

                    {/* => Mutually exclusive by design - password_set tells us
                           whether this admin has ever completed setup */}
                    {target.password_set ? (
                        <button className="adm-admin-detail-btn adm-admin-detail-btn--outline" onClick={handleResetPassword}>
                            <img src={ResendIcon} alt="Reset password" />
                            Reset Password
                        </button>
                    ) : (
                        <button className="adm-admin-detail-btn adm-admin-detail-btn--outline" onClick={handleResendInvite}>
                            <img src={ResendIcon} alt="Resend invite" />
                            Resend Invite
                        </button>
                    )}
                </div>
            </div>

            <div className="adm-admin-detail-card">
                <div className="adm-admin-detail-sections-header">
                    <h3>Section Access</h3>
                    <span className="adm-admin-detail-sections-count">
                        {selectedCount} of {SECTION_OPTIONS.length} selected
                    </span>
                </div>

                <div className="adm-admin-detail-checkbox-grid">
                    {SECTION_OPTIONS.map(({ key, label }) => (
                        <label
                            key={key}
                            className={`adm-admin-detail-checkbox ${sections.includes(key) ? 'adm-admin-detail-checkbox--checked' : ''}`}
                        >
                            <input
                                type="checkbox"
                                checked={sections.includes(key)}
                                onChange={() => toggleSection(key)}
                            />
                            {label}
                        </label>
                    ))}
                </div>

                <button className="adm-admin-detail-save" onClick={handleSavePermissions} disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save Section Access'}
                </button>
            </div>

            <div className="adm-admin-detail-card">
                <div className="adm-admin-detail-sections-header">
                    <h3>Activity Logs</h3>
                    <span className="adm-admin-detail-sections-count">
                        {logs.length > 0 ? `Page ${logsPage} of ${logsTotalPages}` : '0 entries'}
                    </span>
                </div>

                {logsLoading ? (
                    <LoadingState message="Loading activity logs..." />
                ) : logs.length === 0 ? (
                    <p className="adm-admin-detail-logs-empty">No activity yet.</p>
                ) : (
                    <>
                        <div className="adm-admin-detail-logs-table-wrap">
                            <table className="adm-admin-detail-logs-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Action</th>
                                        <th>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map((log) => (
                                        <tr key={log.log_id}>
                                            <td className="adm-admin-detail-logs-date">{formatLogDate(log.created_at)}</td>
                                            <td className="adm-admin-detail-logs-action">{log.action}</td>
                                            <td className="adm-admin-detail-logs-detail">{log.action_detail}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {logsTotalPages > 1 && (
                            <div className="adm-admin-detail-logs-pagination">
                                <button disabled={logsPage <= 1} onClick={() => setLogsPage(p => p - 1)}>Previous</button>
                                <span>Page {logsPage} of {logsTotalPages}</span>
                                <button disabled={logsPage >= logsTotalPages} onClick={() => setLogsPage(p => p + 1)}>Next</button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </main>
    );
}