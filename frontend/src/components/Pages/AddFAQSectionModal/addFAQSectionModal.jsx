// => components/Pages/AddFAQSectionModal/addFAQSectionModal.jsx
// => Single-field "Add Section" modal - mirrors the shape of Courses.jsx's
//    AddSectorModal (name in, onCreated out). Add-only for now; sections
//    are deleted from faqsWYSIWYG.jsx directly once empty of FAQs.

import React, { useState } from 'react';
import axiosAdmin from '../../../utils/axiosAdmin.js';
import closeIcon from '../../../assets/icons/close.png';
import warningIcon from '../../../assets/icons/warning.png';
import './addFAQSectionModal.css';

export default function AddFAQSectionModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const canSave = name.trim().length > 0;

  const handleSave = async () => {
    setError(null);
    if (!canSave) {
      setError('Section name is required.');
      return;
    }
    setSaving(true);
    try {
      const res = await axiosAdmin.post('/api/admin/pages/faqs-sections', { name: name.trim() });
      onCreated(res.data.section);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create section.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="adm-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="adm-modal-box adm-modal-box--form">

        <div className="adm-modal-header">
          <span className="adm-modal-title">Add FAQ Section</span>
          <button className="adm-modal-close" onClick={onClose} disabled={saving}>
            <img src={closeIcon} alt="Close" />
          </button>
        </div>

        <div className="adm-modal-body">
          <div className="adm-form-group">
            <label className="adm-form-label">Section Name <span className="adm-form-required">*</span></label>
            <input
              type="text"
              className="adm-form-input"
              placeholder="e.g. Accounts, Enrollment, Payments"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {error && (
            <p className="adm-form-error"><img className="afsm-inline-icon" src={warningIcon} alt="" /> {error}</p>
          )}
        </div>

        <div className="adm-modal-footer">
          <button className="adm-modal-cancel-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="adm-modal-save-btn" onClick={handleSave} disabled={saving || !canSave}>
            {saving ? 'Adding…' : 'Add Section'}
          </button>
        </div>

      </div>
    </div>
  );
}