// => components/Classes/AddTrainerModal/addTrainerModal.jsx
// => Creates a trainer, gated by handles_tesda/handles_shs checkboxes.
//    Unlike Facilities' single "allows all courses" toggle, a trainer
//    has no all-access escape hatch - each program type you enable requires
//    picking at least one course in it, enforced by the server and mirrored
//    here as a disabled-button convenience check.
//
// => Same two assumptions as AddFacilityModal.jsx:
//    #1: adm-modal-* / adm-form-* classes are global (Classes.css).
//    #2: shs-courses response shape is { courses: [...] } or { data: [...] } -
//        adjust the destructure in loadOptions() if the real shape differs.

import React, { useEffect, useState } from 'react';
import axiosAdmin from '../../../api/axiosAdmin.js';
import closeIcon from '../../../assets/icons/close.png'; 
import warningIcon from '../../../assets/icons/warning.png'; 
import './addTrainerModal.css';

// => Philippine mobile format: must start with 09, exactly 11 digits total
const PHONE_REGEX = /^09\d{9}$/;

// => Standard broad email format - accepts gmail/icloud/yahoo/outlook/custom
//    domains alike, doesn't whitelist specific providers
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// => Empty form state - used on mount and reset
const EMPTY_FORM = {
  trainer_full_name: '',
  contact_number: '',
  email: '',
  remarks: '',
  handles_tesda: false,
  handles_shs: false,
  tesda_course_ids: [],
  shs_course_ids: [],
};

export default function AddTrainerModal({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [tesdaCourses, setTesdaCourses] = useState([]);
  const [shsCourses, setShsCourses] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // => Load TESDA + SHS course options once on mount, in parallel
  useEffect(() => {
    const loadOptions = async () => {
      setOptionsLoading(true);
      setOptionsError(null);
      try {
        const [tesdaRes, shsCoursesRes] = await Promise.all([
          axiosAdmin.get('/api/admin/tesda-courses'),
          axiosAdmin.get('/api/admin/shs-courses'),
        ]);
        setTesdaCourses(tesdaRes.data.data);
        setShsCourses(shsCoursesRes.data.courses ?? shsCoursesRes.data.data ?? []);
      } catch (err) {
        console.error('Failed to load course options:', err);
        setOptionsError('Could not load course options. Please try again.');
      } finally {
        setOptionsLoading(false);
      }
    };
    loadOptions();
  }, []);

  // => Toggle a single TESDA course in/out of the selected list
  const toggleTesdaCourse = (courseId) => {
    setForm(f => ({
      ...f,
      tesda_course_ids: f.tesda_course_ids.includes(courseId)
        ? f.tesda_course_ids.filter(id => id !== courseId)
        : [...f.tesda_course_ids, courseId],
    }));
  };

  // => Toggle a single SHS course in/out of the selected list
  const toggleShsCourse = (courseId) => {
    setForm(f => ({
      ...f,
      shs_course_ids: f.shs_course_ids.includes(courseId)
        ? f.shs_course_ids.filter(id => id !== courseId)
        : [...f.shs_course_ids, courseId],
    }));
  };

  // => Turning a program type OFF clears its selected courses too - avoids
  //    silently submitting stale course_ids for a type that's no longer enabled
  const toggleHandlesTesda = (checked) => {
    setForm(f => ({ ...f, handles_tesda: checked, tesda_course_ids: checked ? f.tesda_course_ids : [] }));
  };
  const toggleHandlesShs = (checked) => {
    setForm(f => ({ ...f, handles_shs: checked, shs_course_ids: checked ? f.shs_course_ids : [] }));
  };

  // => Client-side convenience check mirroring the server's validation -
  //    at least one program type, and each enabled type needs >= 1 course
  const isFormValid = () => {
    if (!form.trainer_full_name.trim() || !form.contact_number.trim()) return false;
    if (!PHONE_REGEX.test(form.contact_number.trim())) return false;
    if (form.email.trim() && !EMAIL_REGEX.test(form.email.trim())) return false;
    if (!form.handles_tesda && !form.handles_shs) return false;
    if (form.handles_tesda && form.tesda_course_ids.length === 0) return false;
    if (form.handles_shs && form.shs_course_ids.length === 0) return false;
    return true;
  };

  // => Submit the new trainer - server re-validates everything above,
  //    this is just the disabled-button convenience check on the client side
  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await axiosAdmin.post('/api/admin/trainers', {
        trainer_full_name: form.trainer_full_name,
        contact_number: form.contact_number,
        email: form.email?.trim() || null,
        remarks: form.remarks?.trim() || null,
        handles_tesda: form.handles_tesda,
        handles_shs: form.handles_shs,
        tesda_course_ids: form.tesda_course_ids,
        shs_course_ids: form.shs_course_ids,
      });
      onCreated(res.data.trainer);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create trainer.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="adm-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="adm-modal-box adm-modal-box--form">

        <div className="adm-modal-header">
          <span className="adm-modal-title">Add Trainer</span>
          <button className="adm-modal-close" onClick={onClose} disabled={saving}>
            <img src={closeIcon} alt="Close" />
          </button>
        </div>

        <div className="adm-modal-body">

          {/* => Trainer name - required */}
          <div className="adm-form-group">
            <label className="adm-form-label">Full Name <span className="adm-form-required">*</span></label>
            <input
              type="text"
              className="adm-form-input"
              placeholder="e.g. Juan Dela Cruz"
              value={form.trainer_full_name}
              onChange={e => setForm(f => ({ ...f, trainer_full_name: e.target.value }))}
            />
          </div>

          {/* => Contact number - required, must be a valid PH mobile number */}
          <div className="adm-form-group">
            <label className="adm-form-label">Contact Number <span className="adm-form-required">*</span></label>
            <input
              type="text"
              className="adm-form-input"
              placeholder="e.g. 09171234567"
              inputMode="numeric"
              maxLength={11}
              value={form.contact_number}
              onChange={e => {
                // => Strip anything that isn't a digit, then hard-cap at 11
                //    characters - the user physically cannot type past this
                //    or type letters, rather than just seeing an error after
                //    the fact
                const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 11);
                setForm(f => ({ ...f, contact_number: digitsOnly }));
              }}
            />
            {form.contact_number && !PHONE_REGEX.test(form.contact_number.trim()) && (
              <p className="adm-form-error"><img className="adm-inline-icon" src={warningIcon} alt="" /> Must start with 09 and be 11 digits long.</p>
            )}
          </div>

          {/* => Email - optional, reserved for future use same as the model comment notes */}
          <div className="adm-form-group">
            <label className="adm-form-label">Email <span className="adm-form-optional">(optional)</span></label>
            <input
              type="email"
              className="adm-form-input"
              placeholder="e.g. juan.delacruz@email.com"
              maxLength={254}
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
            {form.email && !EMAIL_REGEX.test(form.email.trim()) && (
              <p className="adm-form-error"><img className="adm-inline-icon" src={warningIcon} alt="" /> Please enter a valid email address.</p>
            )}
          </div>

          {/* => Remarks - optional on creation only. Once the trainer
                 exists, remarks become required whenever status changes or
                 they get deleted (handled on the detail page instead). */}
          <div className="adm-form-group">
            <label className="adm-form-label">Remarks <span className="adm-form-optional">(optional)</span></label>
            <textarea
              className="adm-form-input"
              rows={3}
              placeholder="Optional notes about this trainer…"
              value={form.remarks}
              onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
            />
          </div>

          {/* => Program type gates - independent checkboxes, both can be checked.
                 Each one reveals its own course checklist below when enabled. */}
          <div className="trainer-modal-toggle-row">
            <label className="trainer-modal-toggle-label">
              <input
                type="checkbox"
                checked={form.handles_tesda}
                onChange={e => toggleHandlesTesda(e.target.checked)}
              />
              Handles TESDA courses
            </label>
            <label className="trainer-modal-toggle-label">
              <input
                type="checkbox"
                checked={form.handles_shs}
                onChange={e => toggleHandlesShs(e.target.checked)}
              />
              Handles SHS courses
            </label>
          </div>

          {(form.handles_tesda || form.handles_shs) && optionsLoading && (
            <p className="trainer-modal-loading-text">Loading course options…</p>
          )}

          {(form.handles_tesda || form.handles_shs) && !optionsLoading && optionsError && (
            <p className="adm-form-error"><img className="adm-inline-icon" src={warningIcon} alt="" /> {optionsError}</p>
          )}

          {/* => TESDA checklist only shows when handles_tesda is checked */}
          {form.handles_tesda && !optionsLoading && !optionsError && (
            <div className="adm-form-group">
              <label className="adm-form-label">Assigned TESDA Courses <span className="adm-form-required">*</span></label>
              <div className="trainer-modal-checklist">
                {tesdaCourses.length === 0 ? (
                  <p className="trainer-modal-empty-text">No TESDA courses yet.</p>
                ) : (
                  tesdaCourses.map(c => (
                    <label key={c.course_id} className="trainer-modal-check-item">
                      <input
                        type="checkbox"
                        checked={form.tesda_course_ids.includes(c.course_id)}
                        onChange={() => toggleTesdaCourse(c.course_id)}
                      />
                      {c.title}{c.certification_type ? ` (${c.certification_type})` : ''}
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          {/* => SHS checklist only shows when handles_shs is checked */}
          {form.handles_shs && !optionsLoading && !optionsError && (
            <div className="adm-form-group">
              <label className="adm-form-label">Assigned SHS Courses <span className="adm-form-required">*</span></label>
              <div className="trainer-modal-checklist">
                {shsCourses.length === 0 ? (
                  <p className="trainer-modal-empty-text">No SHS courses yet.</p>
                ) : (
                  shsCourses.map(c => (
                    <label key={c.course_id} className="trainer-modal-check-item">
                      <input
                        type="checkbox"
                        checked={form.shs_course_ids.includes(c.course_id)}
                        onChange={() => toggleShsCourse(c.course_id)}
                      />
                      {c.title}
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          {/* => Save-time error (distinct from optionsError above, which is
                 a load-time failure) */}
          {error && (
            <p className="adm-form-error"><img className="adm-inline-icon" src={warningIcon} alt="" /> {error}</p>
          )}
        </div>

        <div className="adm-modal-footer">
          <button className="adm-modal-cancel-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="adm-modal-save-btn" onClick={handleSave} disabled={saving || !isFormValid()}>
            {saving ? 'Creating…' : 'Create Trainer'}
          </button>
        </div>

      </div>
    </div>
  );
}
