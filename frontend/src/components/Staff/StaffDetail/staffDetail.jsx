import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import toast from 'react-hot-toast';
import BackButton from '../../BackButton/BackButton.jsx';
import LoadingState from '../../LoadingState/loadingState.jsx';
import axiosAdmin from '../../../utils/axiosAdmin.js';
import './staffDetail.css';

import ResendIcon from '../../../assets/icons/resend.png';
// => Same pencil icon path/depth as ResendIcon above, opens the inline
// => Full Name / Email edit fields in the profile header
import pencilIcon from '../../../assets/icons/pencil.png';
// => Shared log table + pagination component, chevron icon lives inside it now
import LogComponent from '../../LogComponent/logComponent.jsx';

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

// => Same EMAIL_REGEX as StudentDetail.jsx, kept local since this file
// => never imports validators from other pages by project convention
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const validateEmail = (value) => {
    if (!value || !value.trim()) return 'Email is required.';
    if (!EMAIL_REGEX.test(value)) return 'Please enter a valid email address.';
    return null;
};

// => Generic required-text check, same pattern as StudentDetail.jsx
const validateRequiredText = (label) => (value) => {
    if (!value || !value.trim()) return `${label} is required.`;
    return null;
};

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

    // => Profile edit mode (Full Name / Email), same pencil -> Save/Cancel
    // => interaction as StudentDetail.jsx's Account & Personal Profile section
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [profileDraft, setProfileDraft] = useState({ fullName: '', email: '' });
    const [profileFieldErrors, setProfileFieldErrors] = useState({});
    const [profileSectionError, setProfileSectionError] = useState(null);
    const [profileSaving, setProfileSaving] = useState(false);
    // => Row-expand state used to live here (expandedLogId) - it now lives
    //    inside LogComponent itself since it's pure UI state with no data
    //    dependency, no parent page needs to read or reset it.

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

    // => Column defs handed to LogComponent, same Date/Actor/Action/Details
    //    layout used on Students/Courses/Facilities/Trainers/Support Tickets
    const logColumns = [
        { key: 'date', header: 'Date', render: (log) => formatLogDate(log.created_at) },
        {
            key: 'actor',
            header: 'Actor',
            render: (log) => log.actor_type === 'System' ? (
                <span className="adm-admin-detail-logs-badge-system">System</span>
            ) : (
                log.actor_name
            ),
        },
        { key: 'action', header: 'Action', render: (log) => log.action },
        {
            key: 'details',
            header: 'Details',
            cellClassName: 'logc-log-detail-cell',
            render: (log) => log.action_detail || '-',
        },
    ];

    useEffect(() => {
        fetchStaffMember();
    }, [fetchStaffMember]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const startEditProfile = () => {
        setProfileDraft({ fullName: target.full_name ?? '', email: target.email ?? '' });
        setProfileFieldErrors({});
        setProfileSectionError(null);
        setIsEditingProfile(true);
    };

    const cancelEditProfile = () => {
        setIsEditingProfile(false);
        setProfileDraft({ fullName: '', email: '' });
        setProfileFieldErrors({});
        setProfileSectionError(null);
    };

    const handleSaveProfile = async () => {
        // => Re-validate on save in case a field was never touched
        const errors = {
            fullName: validateRequiredText('Full Name')(profileDraft.fullName),
            email: validateEmail(profileDraft.email),
        };
        if (Object.values(errors).some(Boolean)) {
            setProfileFieldErrors(errors);
            setProfileSectionError('Please fix the highlighted fields before saving.');
            return;
        }
        setProfileSaving(true);
        setProfileSectionError(null);
        try {
            const res = await axiosAdmin.put(`/api/admin/admins/${publicId}`, {
                fullName: profileDraft.fullName,
                email: profileDraft.email,
            });
            setTarget(prev => ({ ...prev, ...res.data }));
            setIsEditingProfile(false);
            toast.success('Staff profile updated');
            // => Refetch so the newly written log shows up immediately
            fetchLogs();
        } catch (error) {
            const message = error.response?.data?.message || 'Failed to update profile';
            setProfileSectionError(message);
            toast.error(message);
        } finally {
            setProfileSaving(false);
        }
    };

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
                        {isEditingProfile ? (
                            // => Edit mode: Full Name / Email swap to inputs, Save/Cancel below
                            <div className="adm-admin-detail-edit-fields">
                                <div className="adm-admin-detail-edit-field">
                                    <label className="adm-admin-detail-edit-label">
                                        Full Name <span className="adm-req-asterisk">*</span>
                                    </label>
                                    <input
                                        className={`adm-edit-input ${profileFieldErrors.fullName ? 'adm-edit-input--error' : ''}`}
                                        type="text"
                                        value={profileDraft.fullName}
                                        onChange={e => {
                                            const value = e.target.value;
                                            setProfileDraft(prev => ({ ...prev, fullName: value }));
                                            setProfileFieldErrors(prev => ({ ...prev, fullName: validateRequiredText('Full Name')(value) }));
                                        }}
                                    />
                                    {profileFieldErrors.fullName && <span className="adm-edit-error">{profileFieldErrors.fullName}</span>}
                                </div>

                                <div className="adm-admin-detail-edit-field">
                                    <label className="adm-admin-detail-edit-label">
                                        Email <span className="adm-req-asterisk">*</span>
                                    </label>
                                    <input
                                        className={`adm-edit-input ${profileFieldErrors.email ? 'adm-edit-input--error' : ''}`}
                                        type="email"
                                        value={profileDraft.email}
                                        onChange={e => {
                                            const value = e.target.value;
                                            setProfileDraft(prev => ({ ...prev, email: value }));
                                            setProfileFieldErrors(prev => ({ ...prev, email: validateEmail(value) }));
                                        }}
                                    />
                                    {profileFieldErrors.email && <span className="adm-edit-error">{profileFieldErrors.email}</span>}
                                </div>

                                {profileSectionError && <p className="adm-section-error">{profileSectionError}</p>}

                                <div className="adm-admin-detail-edit-actions">
                                    <button className="adm-section-save-btn" onClick={handleSaveProfile} disabled={profileSaving}>
                                        {profileSaving ? 'Saving...' : 'Save'}
                                    </button>
                                    <button className="adm-section-cancel-btn" onClick={cancelEditProfile} disabled={profileSaving}>
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
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
                                    {/* => Pencil opens the Full Name / Email edit fields above */}
                                    <button className="adm-section-edit-btn" onClick={startEditProfile} title="Edit profile">
                                        <img src={pencilIcon} alt="Edit" className="adm-pencil-icon" />
                                    </button>
                                </div>
                                <p className="adm-admin-detail-email">{target.email}</p>
                            </>
                        )}
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
                <p className="adm-admin-detail-section-title">
                    Activity Logs
                    <span className="adm-admin-detail-section-count">{logs.length}</span>
                </p>

                <LogComponent
                    logs={logs}
                    columns={logColumns}
                    getRowId={(log) => log.log_id}
                    loading={logsLoading}
                    emptyMessage="No activity recorded for this staff member yet."
                    page={logsPage}
                    totalPages={logsTotalPages}
                    onPageChange={setLogsPage}
                    renderDetail={(log) => <p>{log.action_detail || '-'}</p>}
                />
            </div>
        </main>
    );
}