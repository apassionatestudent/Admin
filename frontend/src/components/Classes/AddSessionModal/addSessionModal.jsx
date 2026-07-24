// => components/Classes/AddSessionModal/addSessionModal.jsx
// => Dual-mode: if facilityPublicId is passed, this books a Local
//    (facility-based) session. If not, it's the Mobile & Online flow -
//    radio between Mobile/Online, no facility, no 8AM-5PM window.
// => SHS batches can hold more than one course per grade level within the
//    same cluster, so picking a batch narrows to a grade, and picking a
//    grade narrows to a specific course within that grade - it's a
//    three-step drill-down, not a single grade-level pick like before.

import React, { useEffect, useState } from 'react';
import axiosAdmin from '../../../api/axiosAdmin.js'; // => ADJUST relative path
import closeIcon from '../../../assets/icons/close.png'; // => ADJUST path
import warningIcon from '../../../assets/icons/warning.png'; // => ADJUST path
import clockIcon from '../../../assets/icons/clock.png';
import personIcon from '../../../assets/icons/person.png';
import mapPinIcon from '../../../assets/icons/map-pin.png';
import linkIcon from '../../../assets/icons/link.png';
import './addSessionModal.css';

const BOOKING_START_TIME = '08:00';
const BOOKING_END_TIME = '17:00';

const EMPTY_FORM = {
  batch_type: 'tesda',
  batch_id: '',
  session_date: '',
  start_time: '',
  end_time: '',
  grade_level: '',
  shs_course_id: '',
  trainer_id: null,
  trainer_name: '',
  remarks: '',
  session_type: '',
  mobile_location: '',
  meeting_link: '',
};

export default function AddSessionModal({ facilityPublicId, prefill, onClose, onCreated }) {
  const isLocalMode = Boolean(facilityPublicId);

  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    session_type: isLocalMode ? 'Local' : 'Mobile',
    session_date: prefill?.date || '',
    start_time: prefill?.startTime || '',
    end_time: prefill?.endTime || '',
  }));
  const [tesdaBatches, setTesdaBatches] = useState([]);
  const [shsBatches, setShsBatches] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadOptions = async () => {
      setOptionsLoading(true);
      setOptionsError(null);
      try {
        const url = isLocalMode
          ? `/api/admin/class-sessions/facilities/${facilityPublicId}/eligible-batches`
          : '/api/admin/class-sessions/batches';
        const res = await axiosAdmin.get(url);
        setTesdaBatches(res.data.tesda ?? []);
        setShsBatches(res.data.shs ?? []);
      } catch (err) {
        console.error('Failed to load eligible batches:', err);
        setOptionsError('Could not load eligible batches. Please try again.');
      } finally {
        setOptionsLoading(false);
      }
    };
    loadOptions();
  }, [facilityPublicId, isLocalMode]);

  const handleBatchTypeChange = (type) => {
    setForm(f => ({ ...f, batch_type: type, batch_id: '', grade_level: '', shs_course_id: '', trainer_id: null, trainer_name: '' }));
  };

  const handleTesdaBatchChange = (batchId) => {
    const batch = tesdaBatches.find(b => String(b.batch_id) === String(batchId));
    setForm(f => ({
      ...f,
      batch_id: batchId,
      trainer_id: batch?.trainer_id ?? null,
      trainer_name: batch?.trainer_name ?? '',
    }));
  };

  // => Grade level is no longer a user choice - the backend already
  //    resolved which grade is "active" for this batch (Grade 11 until
  //    marked completed, Grade 12 after). Picking a batch auto-fills grade,
  //    trainer, and the course too if there's only one option under that grade.
  const handleShsBatchChange = (batchId) => {
    const batch = shsBatches.find(b => String(b.batch_id) === String(batchId));
    setForm(f => ({
      ...f,
      batch_id: batchId,
      grade_level: batch?.active_grade ?? '',
      shs_course_id: batch?.active_courses?.length === 1 ? String(batch.active_courses[0].course_id) : '',
      trainer_id: batch?.active_trainer_id ?? null,
      trainer_name: batch?.active_trainer_name ?? '',
    }));
  };

  const handleShsCourseChange = (courseId) => {
    setForm(f => ({ ...f, shs_course_id: courseId }));
  };

  const selectedShsBatch = shsBatches.find(b => String(b.batch_id) === String(form.batch_id));

  const isWithinBookingWindow = (time) => !time || (time >= BOOKING_START_TIME && time <= BOOKING_END_TIME);
  const timeWindowOk = !isLocalMode || (isWithinBookingWindow(form.start_time) && isWithinBookingWindow(form.end_time));

  const isWeekday = (dateStr) => {
    if (!dateStr) return true;
    const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
    return day !== 0 && day !== 6;
  };
  const weekdayOk = !isLocalMode || isWeekday(form.session_date);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await axiosAdmin.post('/api/admin/class-sessions', {
        facility_public_id: isLocalMode ? facilityPublicId : null,
        session_type: isLocalMode ? 'Local' : form.session_type,
        batch_type: form.batch_type,
        batch_id: form.batch_id ? Number(form.batch_id) : null,
        session_date: form.session_date,
        start_time: form.start_time,
        end_time: form.end_time,
        trainer_id: form.trainer_id,
        shs_course_id: form.batch_type === 'shs' && form.shs_course_id ? Number(form.shs_course_id) : null,
        mobile_location: form.session_type === 'Mobile' ? (form.mobile_location?.trim() || null) : null,
        meeting_link: form.session_type === 'Online' ? (form.meeting_link?.trim() || null) : null,
        remarks: form.remarks?.trim() || null,
      });
      onCreated(res.data.session);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create class session.');
    } finally {
      setSaving(false);
    }
  };

  const canSave = form.session_date && form.start_time && form.end_time && form.batch_id && timeWindowOk && weekdayOk &&
    (form.batch_type === 'tesda' || (form.grade_level && form.shs_course_id));

  return (
    <div className="adm-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="adm-modal-box adm-modal-box--form">

        <div className="adm-modal-header">
          <span className="adm-modal-title">{isLocalMode ? 'Book Class Session' : 'Add Mobile / Online Session'}</span>
          <button className="adm-modal-close" onClick={onClose} disabled={saving}>
            <img src={closeIcon} alt="Close" />
          </button>
        </div>

        <div className="adm-modal-body">

          {!isLocalMode && (
            <div className="adm-form-group">
              <label className="adm-form-label">Session Type <span className="adm-form-required">*</span></label>
              <div className="asm-type-toggle">
                <button
                  type="button"
                  className={`asm-type-btn ${form.session_type === 'Mobile' ? 'asm-type-btn--active' : ''}`}
                  onClick={() => setForm(f => ({ ...f, session_type: 'Mobile', meeting_link: '' }))}
                >
                  <img className="asm-inline-icon" src={mapPinIcon} alt="" /> Mobile
                </button>
                <button
                  type="button"
                  className={`asm-type-btn ${form.session_type === 'Online' ? 'asm-type-btn--active' : ''}`}
                  onClick={() => setForm(f => ({ ...f, session_type: 'Online', mobile_location: '' }))}
                >
                  <img className="asm-inline-icon" src={linkIcon} alt="" /> Online
                </button>
              </div>
            </div>
          )}

          <div className="adm-form-row">
            <div className="adm-form-group asm-full-width">
              <label className="adm-form-label">Date <span className="adm-form-required">*</span></label>
              <input
                type="date"
                className="adm-form-input"
                value={form.session_date}
                onChange={e => setForm(f => ({ ...f, session_date: e.target.value }))}
              />
            </div>
          </div>

          <div className="adm-form-row">
            <div className="adm-form-group">
              <label className="adm-form-label">
                <img className="asm-inline-icon" src={clockIcon} alt="" /> Start Time <span className="adm-form-required">*</span>
              </label>
              <input
                type="time"
                {...(isLocalMode ? { min: BOOKING_START_TIME, max: BOOKING_END_TIME } : {})}
                className="adm-form-input"
                value={form.start_time}
                onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
              />
            </div>
            <div className="adm-form-group">
              <label className="adm-form-label">
                <img className="asm-inline-icon" src={clockIcon} alt="" /> End Time <span className="adm-form-required">*</span>
              </label>
              <input
                type="time"
                {...(isLocalMode ? { min: BOOKING_START_TIME, max: BOOKING_END_TIME } : {})}
                className="adm-form-input"
                value={form.end_time}
                onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
              />
            </div>
          </div>

          {isLocalMode && !timeWindowOk && (form.start_time || form.end_time) && (
            <p className="adm-form-error">
              <img className="asm-inline-icon" src={warningIcon} alt="" /> Facility-based class sessions must be between 8:00 AM and 5:00 PM.
            </p>
          )}

          {isLocalMode && !weekdayOk && (
            <p className="adm-form-error">
              <img className="asm-inline-icon" src={warningIcon} alt="" /> Facility-based class sessions can only be booked on weekdays.
            </p>
          )}

          <div className="adm-form-group">
            <label className="adm-form-label">Batch Type <span className="adm-form-required">*</span></label>
            <div className="asm-type-toggle">
              <button
                type="button"
                className={`asm-type-btn ${form.batch_type === 'tesda' ? 'asm-type-btn--active' : ''}`}
                onClick={() => handleBatchTypeChange('tesda')}
              >
                TESDA
              </button>
              <button
                type="button"
                className={`asm-type-btn ${form.batch_type === 'shs' ? 'asm-type-btn--active' : ''}`}
                onClick={() => handleBatchTypeChange('shs')}
              >
                SHS
              </button>
            </div>
          </div>

          {optionsLoading ? (
            <p className="asm-loading-text">Loading eligible batches…</p>
          ) : optionsError ? (
            <p className="adm-form-error"><img className="asm-inline-icon" src={warningIcon} alt="" /> {optionsError}</p>
          ) : form.batch_type === 'tesda' ? (
            <div className="adm-form-group">
              <label className="adm-form-label">TESDA Batch <span className="adm-form-required">*</span></label>
              {tesdaBatches.length === 0 ? (
                <p className="asm-empty-text">No eligible TESDA batches{isLocalMode ? ' for this facility' : ''}.</p>
              ) : (
                <select
                  className="adm-form-input"
                  value={form.batch_id}
                  onChange={e => handleTesdaBatchChange(e.target.value)}
                >
                  <option value="">Select a batch…</option>
                  {tesdaBatches.map(b => (
                    <option key={b.batch_id} value={b.batch_id}>
                      {b.course_title}{b.certification_type ? ` (${b.certification_type})` : ''} (Batch #{b.batch_id}, {b.status})
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <>
              <div className="adm-form-group">
                <label className="adm-form-label">SHS Cluster Batch <span className="adm-form-required">*</span></label>
                {shsBatches.length === 0 ? (
                  <p className="asm-empty-text">No eligible SHS batches{isLocalMode ? ' for this facility' : ''}.</p>
                ) : (
                  <select
                    className="adm-form-input"
                    value={form.batch_id}
                    onChange={e => handleShsBatchChange(e.target.value)}
                  >
                    <option value="">Select a cluster batch…</option>
                    {shsBatches.map(b => (
                      <option key={b.batch_id} value={b.batch_id}>
                        {b.cluster_name} ({b.school_year}, {b.status})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {selectedShsBatch && (
                <div className="adm-form-group">
                  <label className="adm-form-label">Grade Level</label>
                  <p className="asm-trainer-readout">
                    {selectedShsBatch.active_grade}
                    {selectedShsBatch.grade11_completed && ' (Grade 11 completed)'}
                  </p>
                </div>
              )}

              {/* => The actual selectable field - a cluster can hold more
                     than one course under the same grade (e.g. "Hospitality
                     and Tourism" Grade 11 has both Bakery Operations and
                     Hotel Operation), so this is a dropdown when there's a
                     choice, or a plain readout when there's only one option. */}
              {selectedShsBatch && (
                <div className="adm-form-group">
                  <label className="adm-form-label">Course <span className="adm-form-required">*</span></label>
                  {selectedShsBatch.active_courses.length === 1 ? (
                    <p className="asm-trainer-readout">{selectedShsBatch.active_courses[0].title}</p>
                  ) : (
                    <select
                      className="adm-form-input"
                      value={form.shs_course_id}
                      onChange={e => handleShsCourseChange(e.target.value)}
                    >
                      <option value="">Select a course…</option>
                      {selectedShsBatch.active_courses.map(c => (
                        <option key={c.course_id} value={c.course_id}>{c.title}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </>
          )}

          {form.trainer_name && (
            <div className="adm-form-group">
              <label className="adm-form-label">
                <img className="asm-inline-icon" src={personIcon} alt="" /> Trainer
              </label>
              <p className="asm-trainer-readout">{form.trainer_name}</p>
            </div>
          )}

          {!isLocalMode && form.session_type === 'Mobile' && (
            <div className="adm-form-group">
              <label className="adm-form-label">
                <img className="asm-inline-icon" src={mapPinIcon} alt="" /> Google Maps Link <span className="adm-form-optional">(optional)</span>
              </label>
              <input
                type="text"
                className="adm-form-input"
                placeholder="https://maps.google.com/…"
                value={form.mobile_location}
                onChange={e => setForm(f => ({ ...f, mobile_location: e.target.value }))}
              />
            </div>
          )}
          {!isLocalMode && form.session_type === 'Online' && (
            <div className="adm-form-group">
              <label className="adm-form-label">
                <img className="asm-inline-icon" src={linkIcon} alt="" /> Meeting Link <span className="adm-form-optional">(optional)</span>
              </label>
              <input
                type="text"
                className="adm-form-input"
                placeholder="https://meet.google.com/…"
                value={form.meeting_link}
                onChange={e => setForm(f => ({ ...f, meeting_link: e.target.value }))}
              />
            </div>
          )}

          <div className="adm-form-group">
            <label className="adm-form-label">Remarks <span className="adm-form-optional">(optional)</span></label>
            <textarea
              className="adm-form-input"
              rows={2}
              placeholder="Optional notes about this session…"
              value={form.remarks}
              onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
            />
          </div>

          {error && (
            <p className="adm-form-error"><img className="asm-inline-icon" src={warningIcon} alt="" /> {error}</p>
          )}
        </div>

        <div className="adm-modal-footer">
          <button className="adm-modal-cancel-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="adm-modal-save-btn" onClick={handleSave} disabled={saving || !canSave}>
            {saving ? 'Creating…' : 'Create Session'}
          </button>
        </div>

      </div>
    </div>
  );
}