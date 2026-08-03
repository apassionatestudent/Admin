import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import axiosAdmin from '../../utils/axiosAdmin.js';
import './account.css';

// => Icon imports needed, replace src paths with your Icons8 assets
// import editIcon from '../../assets/icons/edit.png';
// import lockIcon from '../../assets/icons/lock.png';
// import moonIcon from '../../assets/icons/moon.png';
// import sunIcon from '../../assets/icons/sun.png';
// import userIcon from '../../assets/icons/user-circle.png';
// import paletteIcon from '../../assets/icons/palette.png';
// import historyIcon from '../../assets/icons/history.png';

function Account() {
    const [account, setAccount] = useState(null);
    const [loading, setLoading] = useState(true);

    // => Profile edit state
    const [fullName, setFullName] = useState('');
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

    // => Save updated full name
    async function handleSaveProfile() {
        try {
            const res = await axiosAdmin.patch('/api/admin/account/profile', {
                full_name: fullName,
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

    // => Turn action codes into readable labels, e.g. "profile_updated" -> "Profile updated"
    function formatAction(action) {
        return action.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
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
                <h2 className="adm-account-card-title">
                    {/* <img src={userIcon} alt="" className="adm-account-icon" /> */}
                    Profile Information
                </h2>

                <div className="adm-account-grid adm-account-g2">
                    <div className="adm-account-field-group">
                        <div className="adm-account-label-row">
                            <span className="adm-account-label">Full Name</span>
                            {!editingProfile && (
                                <button
                                    className="adm-account-btn-icon"
                                    onClick={() => setEditingProfile(true)}
                                >
                                    {/* <img src={editIcon} alt="" /> */}
                                    Edit
                                </button>
                            )}
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
                        <div className="adm-account-box">{account.email}</div>
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

            {/* => Activity logs section, mirrors the enrollment detail page's logs table */}
            <section className="adm-account-card">
                <div className="adm-account-logs-title-row">
                    <h2 className="adm-account-card-title adm-account-card-title--no-border">
                        {/* <img src={historyIcon} alt="" className="adm-account-icon" /> */}
                        Activity Logs
                    </h2>
                    <span className="adm-account-logs-count">{logsTotal}</span>
                </div>
                <hr className="adm-account-divider" />

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
                    <>
                        <div className="adm-account-logs-table-wrap">
                            <table className="adm-account-logs-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Actor</th>
                                        <th>Action</th>
                                        <th>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map((log) => (
                                        <tr key={log.log_id}>
                                            <td className="adm-account-logs-date">{formatLogDate(log.created_at)}</td>
                                            <td>{log.actor_name}</td>
                                            <td className="adm-account-logs-action">{formatAction(log.action)}</td>
                                            <td className="adm-account-logs-detail">
                                                {log.entity_type && (
                                                    <span className="adm-account-logs-entity">{log.entity_type}</span>
                                                )}
                                                {log.action_detail}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {logsTotalPages > 1 && (
                            <div className="adm-account-logs-pagination">
                                <button
                                    className="adm-account-btn-secondary"
                                    disabled={logsPage <= 1}
                                    onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                                >
                                    Prev
                                </button>
                                <span className="adm-account-logs-page-label">
                                    Page {logsPage} of {logsTotalPages}
                                </span>
                                <button
                                    className="adm-account-btn-secondary"
                                    disabled={logsPage >= logsTotalPages}
                                    onClick={() => setLogsPage((p) => Math.min(logsTotalPages, p + 1))}
                                >
                                    Next
                                </button>
                            </div>
                        )}
                    </>
                )}
            </section>
        </div>
    );
}

export default Account;