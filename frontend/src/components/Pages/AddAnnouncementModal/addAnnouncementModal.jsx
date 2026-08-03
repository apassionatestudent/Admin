// => components/Pages/AddAnnouncementModal/addAnnouncementModal.jsx
// => Add + Edit Announcement modal - same instance handles both, same
//    pattern as addFAQModal.jsx / addSessionModal.jsx (prefill via props).

import React, { useState } from 'react';
import axiosAdmin from '../../../utils/axiosAdmin.js';
import closeIcon from '../../../assets/icons/close.png';
import warningIcon from '../../../assets/icons/warning.png';
import RichTextEditor from '../RichTextEditor/richTextEditor.jsx';
import './addAnnouncementModal.css';

export default function AddAnnouncementModal({ announcement, onClose, onSaved }) {
  const isEditMode = Boolean(announcement);

  const [title, setTitle] = useState(announcement?.title || '');
  const [message, setMessage] = useState(announcement?.message || '');
  // => Defaults to visible/active for a brand new announcement
  const [isActive, setIsActive] = useState(announcement ? announcement.is_active : true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const canSave = title.trim().length > 0 && message.replace(/<[^>]*>/g, '').trim().length > 0;

  const handleSave = async () => {
    setError(null);
    if (!canSave) {
      setError('Both a title and a message are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = { title: title.trim(), message, is_active: isActive };
      const res = isEditMode
        ? await axiosAdmin.put(`/api/admin/pages/announcements/${announcement.public_id}`, payload)
        : await axiosAdmin.post('/api/admin/pages/announcements', payload);
      // => Hand the server's actual row back up - it has the real
      //    public_id/created_at/updated_at, not locally-guessed values
      onSaved(res.data.announcement);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save announcement.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="adm-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="adm-modal-box adm-modal-box--form aam-modal-box">

        <div className="adm-modal-header">
          <span className="adm-modal-title">{isEditMode ? 'Edit Announcement' : 'Add New Announcement'}</span>
          <button className="adm-modal-close" onClick={onClose} disabled={saving}>
            <img src={closeIcon} alt="Close" />
          </button>
        </div>

        <div className="adm-modal-body">
          <div className="adm-form-group">
            <label className="adm-form-label">Title <span className="adm-form-required">*</span></label>
            <input
              type="text"
              className="adm-form-input"
              placeholder="e.g. Enrollment for AY 2026-2027 is now open"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="adm-form-group">
            <label className="adm-form-label">Message <span className="adm-form-required">*</span></label>
            <RichTextEditor
              value={message}
              onChange={setMessage}
              placeholder="Write the announcement…"
            />
          </div>

          <div className="adm-form-group">
            <label className="aam-toggle-row">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span>Visible to students (Active)</span>
            </label>
          </div>

          {error && (
            <p className="adm-form-error"><img className="aam-inline-icon" src={warningIcon} alt="" /> {error}</p>
          )}
        </div>

        <div className="adm-modal-footer">
          <button className="adm-modal-cancel-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="adm-modal-save-btn" onClick={handleSave} disabled={saving || !canSave}>
            {saving ? 'Saving…' : isEditMode ? 'Save Changes' : 'Add Announcement'}
          </button>
        </div>

      </div>
    </div>
  );
}