import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import axios from 'axios';
import './setAdminPassword.css';

export default function SetAdminPassword() {
    const { token } = useParams();
    const navigate = useNavigate();

    const [info, setInfo] = useState(null);
    const [isInvalid, setIsInvalid] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        // => Plain axios here, not axiosAdmin - this page runs with no admin
        // => session yet, so there's no CSRF token to attach
        axios.get(`/api/admin-invite/${token}`)
            .then(res => setInfo(res.data))
            .catch(() => setIsInvalid(true));
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }

        setIsSubmitting(true);
        try {
            await axios.post(`/api/admin-invite/${token}`, { password });
            toast.success('Password set. You can now log in.');
            navigate('/');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to set password');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isInvalid) {
        return (
            <main className="adm-set-password-page">
                <p>This invite link is invalid or has expired. Please ask a super admin to resend it.</p>
            </main>
        );
    }

    if (!info) return null;

    return (
        <main className="adm-set-password-page">
            <h2>Welcome, {info.fullName}</h2>
            <p>Set a password for {info.email} to finish setting up your admin account.</p>

            <form onSubmit={handleSubmit}>
                <label>
                    New Password
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </label>

                <label>
                    Confirm Password
                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                </label>

                <button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Setting Password...' : 'Set Password'}
                </button>
            </form>
        </main>
    );
}