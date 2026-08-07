import React, { useState } from 'react';
import toast from 'react-hot-toast';
import axiosAdmin from '../../../utils/axiosAdmin.js';
import './addStaffModal.css';

import CloseIcon from '../../../assets/icons/close.png';

// => Must match the CHECK constraint on admin_section_permissions.section_key
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

export default function AddStaffModal({ onClose, onCreated }) {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [sections, setSections] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const toggleSection = (key) => {
        setSections(prev =>
            prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]
        );
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!fullName.trim() || !email.trim()) {
            toast.error('Full name and email are required');
            return;
        }

        setIsSubmitting(true);
        try {
            // => Endpoint stays /api/admin/admins on purpose - display-only
            // => rename, backend routes and DB schema are untouched
            await axiosAdmin.post('/api/admin/admins', { fullName, email, sections });
            onCreated();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to create staff account');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="adm-modal-overlay" onClick={onClose}>
            <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
                <div className="adm-modal-header">
                    <h3>Add Staff</h3>
                    <button className="adm-modal-close" onClick={onClose}>
                        <img src={CloseIcon} alt="Close modal" />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <label>
                        Full Name
                        <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                        />
                    </label>

                    <label>
                        Email
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </label>

                    <p className="adm-modal-note">
                        An invite link will be emailed to this address so they can set their own password.
                    </p>

                    <fieldset className="adm-modal-sections">
                        <legend>Section Access</legend>
                        {SECTION_OPTIONS.map(({ key, label }) => (
                            <label key={key} className="adm-modal-checkbox">
                                <input
                                    type="checkbox"
                                    checked={sections.includes(key)}
                                    onChange={() => toggleSection(key)}
                                />
                                {label}
                            </label>
                        ))}
                    </fieldset>

                    <button type="submit" disabled={isSubmitting} className="adm-modal-submit">
                        {isSubmitting ? 'Creating...' : 'Create Staff'}
                    </button>
                </form>
            </div>
        </div>
    );
}