// => components/Classes/RemarksActionModal/RemarksActionModal.jsx
// => Shared modal for any action across the Classes section that requires
//    the admin to explain why - currently used for Active/Inactive status
//    changes and soft deletion. Always requires non-empty remarks; there's
//    no optional mode here on purpose. ConfirmModal already covers plain
//    yes/no confirms elsewhere and is intentionally left untouched.

import React, { useState, useEffect } from 'react';
import warningIcon from '../../../assets/icons/warning.png'; 
import './RemarksActionModal.css';

export default function RemarksActionModal({
  isOpen,
  title,
  message,
  remarksLabel = 'Remarks',
  confirmLabel = 'Confirm',
  saving = false,
  error = null,
  onConfirm,
  onCancel,
}) {
  const [remarks, setRemarks] = useState('');

  // => Reset the textarea every time the modal opens fresh, so leftover
  //    text from a previous action never carries over into the next one
  useEffect(() => {
    if (isOpen) setRemarks('');
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="adm-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !saving) onCancel(); }}>
      <div className="adm-modal-box ram-box">

        <div className="adm-modal-header">
          <span className="adm-modal-title">{title}</span>
        </div>

        <div className="adm-modal-body">
          {message && <p className="ram-message">{message}</p>}

          <div className="adm-form-group">
            <label className="adm-form-label">
              {remarksLabel} <span className="adm-form-required">*</span>
            </label>
            <textarea
              className="adm-form-input ram-textarea"
              rows={4}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Explain the reason for this action…"
            />
          </div>

          {error && (
            <p className="adm-form-error"><img className="adm-inline-icon" src={warningIcon} alt="" /> {error}</p>
          )}
        </div>

        <div className="adm-modal-footer">
          <button className="adm-modal-cancel-btn" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            className="adm-modal-save-btn"
            onClick={() => onConfirm(remarks.trim())}
            disabled={saving || !remarks.trim()}
          >
            {saving ? 'Saving…' : confirmLabel}
          </button>
        </div>

      </div>
    </div>
  );
}