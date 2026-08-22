import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import axiosAdmin from '../../utils/axiosAdmin.js';
import pencilIcon from '../../assets/icons/pencil.png';
// => Shared log table + pagination component, chevron icon lives inside it now
import LogComponent from '../../components/LogComponent/logComponent.jsx';
import './account.css';

function Account() {
    const [account, setAccount] = useState(null);
    const [loading, setLoading] = useState(true);

    // => Profile edit state
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [editingProfile, setEditingProfile] = useState(false);

    // => Password change state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [changingPassword, setChangingPassword] = useState(false);

    // => Theme toggle busy state, prevents double clicks while request is in flight
    const [togglingTheme, setTogglingTheme] = useState(false);

    // => Activity logs state, 10 rows per page via Prev/Next
    const [logs, setLogs] = useState([]);
    const [logsTotal, setLogsTotal] = useState(0);
    const [logsPage, setLogsPage] = useState(1);
    const [logsTotalPages, setLogsTotalPages] = useState(1);
    const [logsLoading, setLogsLoading] = useState(true);
    // => Row-expand state used to live here (expandedLogId) - it now lives
    //    inside LogComponent itself since it's pure UI state with no data
    //    dependency, no parent page needs to read or reset it.

    useEffect(() => {
        fetchAccount();
    }, []);

    useEffect(() => {
        fetchLogs(logsPage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [logsPage]);

    // => Load the current admin's account details
    async function fetchAccount() {
        try {
            setLoading(true);
            const res = await axiosAdmin.get('/api/admin/account');
            setAccount(res.data.account);
            setFullName(res.data.account.full_name);
            setEmail(res.data.account.email);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load account');
        } finally {
            setLoading(false);
        }
    }

    // => Load one page of this admin's own activity logs
    async function fetchLogs(page) {
        try {
            setLogsLoading(true);
            const res = await axiosAdmin.get(`/api/admin/account/logs?page=${page}`);
            setLogs(res.data.logs);
            setLogsTotal(res.data.total);
            setLogsTotalPages(res.data.totalPages);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load activity logs');
        } finally {
            setLogsLoading(false);
        }
    }

    // => Column defs handed to LogComponent. Details column carries the
    //    entity_type badge as well as action_detail, unlike the plainer
    //    Details column on Students/Staff/Courses - kept here since it's
    //    just JSX inside render(), no change needed in LogComponent itself
    const logColumns = [
        { key: 'date', header: 'Date', render: (log) => formatLogDate(log.created_at) },
        {
            key: 'actor',
            header: 'Actor',
            render: (log) => log.actor_type === 'System' ? (
                <span className="adm-account-logs-badge-system">System</span>
            ) : (
                log.actor_name
            ),
        },
        { key: 'action', header: 'Action', render: (log) => log.action },
        {
            key: 'details',
            header: 'Details',
            cellClassName: 'logc-log-detail-cell',
            render: (log) => (
                <>
                    {log.entity_type && <span className="adm-account-logs-entity">{log.entity_type}</span>}
                    {log.action_detail}
                </>
            ),
        },
    ];

    // => Save updated full name
    async function handleSaveProfile() {
        try {
            const res = await axiosAdmin.patch('/api/admin/account/profile', {
                full_name: fullName,
                email: email,
            });
            setAccount(res.data.account);
            setEditingProfile(false);
            toast.success('Profile updated');
            // => Refresh logs so the new profile_updated entry shows up right away
            fetchLogs(1);
            setLogsPage(1);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update profile');
        }
    }

    // => Flip the is_night_mode boolean
    async function handleToggleTheme() {
        try {
            setTogglingTheme(true);
            const res = await axiosAdmin.patch('/api/admin/account/theme', {
                is_night_mode: !account.is_night_mode,
            });
            setAccount(res.data.account);
            toast.success(res.data.account.is_night_mode ? 'Night mode enabled' : 'Day mode enabled');
            fetchLogs(1);
            setLogsPage(1);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update theme');
        } finally {
            setTogglingTheme(false);
        }
    }

    // => Submit password change form
    async function handleChangePassword(e) {
        e.preventDefault();

        if (newPassword !== confirmPassword) {
            toast.error('New password and confirmation do not match');
            return;
        }

        try {
            setChangingPassword(true);
            await axiosAdmin.patch('/api/admin/account/password', {
                current_password: currentPassword,
                new_password: newPassword,
            });
            toast.success('Password updated successfully');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            fetchLogs(1);
            setLogsPage(1);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update password');
        } finally {
            setChangingPassword(false);
        }
    }

    // => Format a timestamp the same way the enrollment detail logs table does: "Jul 31, 2026, 8:04 AM"
    function formatLogDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
    }



    if (loading) {
        return (
            <div className="adm-account-page">
                <div className="adm-account-state">
                    <div className="adm-account-spinner" />
                    <p>Loading account…</p>
                </div>
            </div>
        );
    }

    if (!account) {
        return (
            <div className="adm-account-page">
                <div className="adm-account-state adm-account-state--error">
                    <span className="adm-account-state-icon">⚠</span>
                    <p>Unable to load account details.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="adm-account-page">
            <div className="adm-account-header">
                <h1 className="adm-account-title">Account Settings</h1>
                <p className="adm-account-subtitle">Manage your profile, theme preference, and password.</p>
            </div>

            {/* => Profile section */}
            <section className="adm-account-card">
                <div className="adm-account-section-header">
                    <h2 className="adm-account-card-title adm-account-card-title--in-header">
                        {/* <img src={userIcon} alt="" className="adm-account-icon" /> */}
                        Profile Information
                    </h2>
                    {/* => Only super_admin can edit profile info, backend enforces this too (403 otherwise) */}
                    {!editingProfile && account.role === 'super_admin' && (
                        <button
                            className="section-edit-btn"
                            onClick={() => setEditingProfile(true)}
                            title="Edit profile"
                        >
                            <img src={pencilIcon} alt="Edit" className="pencil-icon" />
                        </button>
                    )}
                </div>

                <div className="adm-account-grid adm-account-g2">
                    <div className="adm-account-field-group">
                        <div className="adm-account-label-row">
                            <span className="adm-account-label">Full Name</span>
                        </div>

                        {editingProfile ? (
                            <div className="adm-account-field-edit-row">
                                <input
                                    type="text"
                                    className="adm-account-input"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                />
                            </div>
                        ) : (
                            <div className="adm-account-box">{account.full_name}</div>
                        )}
                    </div>

                    <div className="adm-account-field-group">
                        <div className="adm-account-label-row">
                            <span className="adm-account-label">Email</span>
                        </div>

                        {editingProfile ? (
                            <div className="adm-account-field-edit-row">
                                <input
                                    type="email"
                                    className="adm-account-input"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                        ) : (
                            <div className="adm-account-box">{account.email}</div>
                        )}
                    </div>

                    <div className="adm-account-field-group">
                        <div className="adm-account-label-row">
                            <span className="adm-account-label">Role</span>
                        </div>
                        <span className="adm-account-badge">{account.role}</span>
                    </div>

                    <div className="adm-account-field-group">
                        <div className="adm-account-label-row">
                            <span className="adm-account-label">Status</span>
                        </div>
                        <span className="adm-account-badge">{account.status}</span>
                    </div>
                </div>

                {editingProfile && (
                    <div className="adm-account-actions">
                        <button
                            className="adm-account-btn-secondary"
                            onClick={() => {
                                setFullName(account.full_name);
                                setEmail(account.email);
                                setEditingProfile(false);
                            }}
                        >
                            Cancel
                        </button>
                        <button className="adm-account-btn" onClick={handleSaveProfile}>
                            Save Changes
                        </button>
                    </div>
                )}
            </section>

            {/* => Theme preference section, actual day/night switching logic deferred */}
            <section className="adm-account-card">
                <h2 className="adm-account-card-title">
                    {/* <img src={paletteIcon} alt="" className="adm-account-icon" /> */}
                    Appearance
                </h2>

                <div className="adm-account-appearance-row">
                    <span>{account.is_night_mode ? 'Night Mode' : 'Day Mode'}</span>
                    <button
                        className="adm-account-btn"
                        disabled={togglingTheme}
                        onClick={handleToggleTheme}
                    >
                        {/* <img src={account.is_night_mode ? sunIcon : moonIcon} alt="" /> */}
                        Switch to {account.is_night_mode ? 'Day' : 'Night'}
                    </button>
                </div>
            </section>

            {/* => Password change section */}
            <section className="adm-account-card">
                <h2 className="adm-account-card-title">
                    {/* <img src={lockIcon} alt="" className="adm-account-icon" /> */}
                    Change Password
                </h2>

                <form onSubmit={handleChangePassword}>
                    <div className="adm-account-grid adm-account-g3">
                        <div className="adm-account-field-group">
                            <span className="adm-account-label">Current Password</span>
                            <input
                                type="password"
                                className="adm-account-input"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                required
                            />
                        </div>

                        <div className="adm-account-field-group">
                            <span className="adm-account-label">New Password</span>
                            <input
                                type="password"
                                className="adm-account-input"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                            />
                        </div>

                        <div className="adm-account-field-group">
                            <span className="adm-account-label">Confirm New Password</span>
                            <input
                                type="password"
                                className="adm-account-input"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="adm-account-actions">
                        <button className="adm-account-btn" type="submit" disabled={changingPassword}>
                            {changingPassword ? 'Updating...' : 'Update Password'}
                        </button>
                    </div>
                </form>
            </section>

            {/* => Activity logs section, design matches StaffDetail's Activity Logs section exactly */}
            <section className="adm-account-card">
                <p className="adm-account-logs-section-title">
                    Activity Logs
                    <span className="adm-account-logs-section-count">{logsTotal}</span>
                </p>

                {logsLoading ? (
                    <div className="adm-account-logs-state">
                        <div className="adm-account-logs-spinner" />
                        <p>Loading logs…</p>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="adm-account-logs-state">
                        <span className="adm-account-state-icon" style={{ fontSize: '2rem' }}>✓</span>
                        <p>No activity yet.</p>
                    </div>
                ) : (
                    <LogComponent
                        logs={logs}
                        columns={logColumns}
                        getRowId={(log) => log.log_id}
                        page={logsPage}
                        totalPages={logsTotalPages}
                        onPageChange={setLogsPage}
                        renderDetail={(log) => (
                            <>
                                {log.entity_type && <span className="adm-account-logs-entity">{log.entity_type}</span>}
                                <p>{log.action_detail || '-'}</p>
                            </>
                        )}
                    />
                )}
            </section>
        </div>
    );
}

export default Account;