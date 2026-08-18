// => components/Pages/AddFAQModal/addFAQModal.jsx
// => Add + Edit FAQ modal - same instance handles both, matching
//    addSessionModal.jsx's pattern (prefill via props, single Save
//    handler that branches on whether we're editing).

import React, { useState } from 'react';
import axiosAdmin from '../../../utils/axiosAdmin.js';
import closeIcon from '../../../assets/icons/close.png';
import warningIcon from '../../../assets/icons/warning.png';
import RichTextEditor from '../RichTextEditor/richTextEditor.jsx';
import './addFAQModal.css';

// => Local copy, not shared with addAnnouncementModal.jsx - same
//    reasoning as everywhere else two modals mirror each other's shape
const formatMetaDate = (isoString) =>
  new Date(isoString).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });

export default function AddFAQModal({ faq, sections, defaultSectionId, onClose, onSaved }) {
  const isEditMode = Boolean(faq);

  const [question, setQuestion] = useState(faq?.question || '');
  const [answer, setAnswer] = useState(faq?.answer || '');
  // => Prefills to the FAQ's current section when editing, or the section
  //    whose "+ Add FAQ" button was clicked when adding new
  const [sectionId, setSectionId] = useState(faq?.section_id ?? defaultSectionId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const getPlainTextFromHtml = (html) => {
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    return doc.body.textContent || '';
  };

  const canSave = question.trim().length > 0 && getPlainTextFromHtml(answer).trim().length > 0 && sectionId !== '';

  const handleSave = async () => {
    setError(null);
    if (!canSave) {
      setError('Both a question and an answer are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = { question: question.trim(), answer, section_id: sectionId };
      const res = isEditMode
        ? await axiosAdmin.put(`/api/admin/pages/faqs/${faq.public_id}`, payload)
        : await axiosAdmin.post('/api/admin/pages/faqs', payload);
      onSaved(res.data.faq);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save FAQ.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="adm-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="adm-modal-box adm-modal-box--form afm-modal-box">

        <div className="adm-modal-header">
          <span className="adm-modal-title">{isEditMode ? 'Edit FAQ' : 'Add New FAQ'}</span>
          <button className="adm-modal-close" onClick={onClose} disabled={saving}>
            <img src={closeIcon} alt="Close" />
          </button>
        </div>

        {/* => Edit mode only - a brand new FAQ has no history to show yet */}
        {isEditMode && (
          <div className="afm-meta-row">
            Created by <strong>{faq.created_by_name}</strong> on {formatMetaDate(faq.created_at)}
            {faq.updated_by_name && (
              <> · Last updated by <strong>{faq.updated_by_name}</strong> on {formatMetaDate(faq.updated_at)}</>
            )}
          </div>
        )}

        <div className="adm-modal-body">
          <div className="adm-form-group">
            <label className="adm-form-label">Section <span className="adm-form-required">*</span></label>
            <select
              className="adm-form-input"
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
            >
              <option value="">Select a section…</option>
              {(sections || []).map((s) => (
                <option key={s.public_id} value={s.public_id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="adm-form-group">
            <label className="adm-form-label">Question <span className="adm-form-required">*</span></label>
            <input
              type="text"
              className="adm-form-input"
              placeholder="e.g. What documents do I need to enroll?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>

          <div className="adm-form-group">
            <label className="adm-form-label">Answer <span className="adm-form-required">*</span></label>
            <RichTextEditor
              value={answer}
              onChange={setAnswer}
              placeholder="Write the answer…"
            />
          </div>

          {error && (
            <p className="adm-form-error"><img className="afm-inline-icon" src={warningIcon} alt="" /> {error}</p>
          )}
        </div>

        <div className="adm-modal-footer">
          <button className="adm-modal-cancel-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="adm-modal-save-btn" onClick={handleSave} disabled={saving || !canSave}>
            {saving ? 'Saving…' : isEditMode ? 'Save Changes' : 'Add FAQ'}
          </button>
        </div>

      </div>
    </div>
  );
}