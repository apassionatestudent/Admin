import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import axios from 'axios';
import './setAdminPassword.css';

// icons
// => Real PNG icons only, no emoji or icon fonts. These four need to exist
// => under admin/src/assets/icons/ - swap the paths below to wherever your
// => project keeps them if different from other pages.
import eyeIcon from '../../assets/icons/eye.png';
import eyeOffIcon from '../../assets/icons/eye-off.png';
import checkMarkIcon from '../../assets/icons/checkmark.png';
import circleIcon from '../../assets/icons/circle.png';
import warningIcon from '../../assets/icons/warning.png';

// => Same rule set enforced here as whatever your backend validates on
// => POST /api/admin-invite/:token - keep both in sync if the backend
// => rule changes
const PASSWORD_RULES = [
    { label: 'At least 8 characters', test: (v) => v.length >= 8 },
    { label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
    { label: 'One number', test: (v) => /[0-9]/.test(v) },
    { label: 'One special character', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export default function SetAdminPassword() {
    const { token } = useParams();
    const navigate = useNavigate();

    const [info, setInfo] = useState(null);
    const [isInvalid, setIsInvalid] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // => Controls whether each field renders as plain text or masked dots
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    // => Only shows the red outline / confirm-mismatch message after the
    // => field has actually been interacted with, so the form doesn't
    // => open already covered in red before the admin types anything
    const [passwordTouched, setPasswordTouched] = useState(false);
    const [confirmTouched, setConfirmTouched] = useState(false);

    useEffect(() => {
        // => Plain axios here, not axiosAdmin - this page runs with no admin
        // => session yet, so there's no CSRF token to attach
        axios.get(`/api/admin-invite/${token}`)
            .then(res => setInfo(res.data))
            .catch(() => setIsInvalid(true));
    }, [token]);

    const allRulesMet = PASSWORD_RULES.every(rule => rule.test(password));
    const passwordsMatch = password && password === confirmPassword;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setPasswordTouched(true);
        setConfirmTouched(true);

        if (!allRulesMet) {
            toast.error('Password does not meet the requirements below.');
            return;
        }
        if (!passwordsMatch) {
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
                <img src={warningIcon} alt="" className="adm-invite-invalid-icon" />
                <p className="adm-invite-invalid-text">
                    This invite link is invalid or has expired. Please ask a super admin to resend it.
                </p>
            </main>
        );
    }

    if (!info) {
        return (
            <main className="adm-set-password-page">
                <p className="adm-set-password-loading">Verifying your invite link…</p>
            </main>
        );
    }

    return (
        <main className="adm-set-password-page">
            <h2>Welcome, {info.fullName}</h2>
            <p>Set a password for {info.email} to finish setting up your admin account.</p>

            <form onSubmit={handleSubmit}>
                <div>
                    <label htmlFor="adm-new-password">New Password</label>
                    <div className="adm-password-field">
                        <input
                            id="adm-new-password"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onBlur={() => setPasswordTouched(true)}
                            className={passwordTouched && !allRulesMet ? 'adm-input-error' : ''}
                        />
                        <button
                            type="button"
                            className="adm-toggle-visibility-btn"
                            onClick={() => setShowPassword(v => !v)}
                            title={showPassword ? 'Hide password' : 'Show password'}
                        >
                            <img
                                src={showPassword ? eyeOffIcon : eyeIcon}
                                alt=""
                                className="adm-toggle-visibility-icon"
                            />
                        </button>
                    </div>

                    {/* => Live checklist, ticks off each rule in real time as the admin types */}
                    <ul className="adm-password-rules">
                        {PASSWORD_RULES.map(rule => {
                            const met = rule.test(password);
                            return (
                                <li key={rule.label} className={met ? 'adm-rule-met' : ''}>
                                    <img
                                        src={met ? checkMarkIcon : circleIcon}
                                        alt=""
                                        className="adm-rule-icon"
                                    />
                                    {rule.label}
                                </li>
                            );
                        })}
                    </ul>
                </div>

                <div>
                    <label htmlFor="adm-confirm-password">Confirm Password</label>
                    <div className="adm-password-field">
                        <input
                            id="adm-confirm-password"
                            type={showConfirm ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            onBlur={() => setConfirmTouched(true)}
                            className={confirmTouched && !passwordsMatch ? 'adm-input-error' : ''}
                        />
                        <button
                            type="button"
                            className="adm-toggle-visibility-btn"
                            onClick={() => setShowConfirm(v => !v)}
                            title={showConfirm ? 'Hide password' : 'Show password'}
                        >
                            <img
                                src={showConfirm ? eyeOffIcon : eyeIcon}
                                alt=""
                                className="adm-toggle-visibility-icon"
                            />
                        </button>
                    </div>
                    {confirmTouched && !passwordsMatch && (
                        <span className="adm-field-error">Passwords do not match.</span>
                    )}
                </div>

                <button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Setting Password...' : 'Set Password'}
                </button>
            </form>
        </main>
    );
}
