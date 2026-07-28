// => components/Classes/AddFacilityModal/AddFacilityModal.jsx
// => Creates a facility, optionally restricted to specific TESDA courses
//    and/or SHS clusters. "Allows all courses" toggles off both checklists
//    for general-purpose rooms (e.g. a lecture hall).
//
// => ASSUMPTION #1: adm-modal-backdrop / adm-modal-box / adm-modal-header /
//    adm-modal-body / adm-modal-footer / adm-form-group / adm-form-label /
//    adm-form-input / adm-form-required / adm-form-optional / adm-form-error
//    classes already exist globally (defined once in Classes.css, used by
//    the existing Add Class modal in Classes.jsx). This component only adds
//    its own checklist-specific classes in AddFacilityModal.css. If those
//    adm-modal-* classes are NOT actually global, tell me and I'll inline
//    them into this component's own CSS file instead.
//
// => ASSUMPTION #2: clusters are fetched from /api/admin/clusters rather
//    than derived from /api/admin/shs-courses. Courses.jsx already imports
//    an AddClusterModal component for CREATING clusters, so a matching
//    GET /api/admin/clusters almost certainly exists for LISTING them
//    (likely served by sectorClusterRoutes.js, already mounted at
//    /api/admin in server.js). Expected response shape below is
//    { clusters: [{ cluster_id, name }, ...] } - adjust the destructure
//    in loadOptions() if the real shape differs.

import React, { useEffect, useState } from 'react';
import axiosAdmin from '../../../api/axiosAdmin.js'; 
import closeIcon from '../../../assets/icons/close.png'; 
import warningIcon from '../../../assets/icons/warning.png'; 
import './AddFacilityModal.css';

// => Empty form state - used on mount and reset
const EMPTY_FORM = {
  name: '',
  capacity: '',
  remarks: '',
  allows_all_courses: false,
  tesda_course_ids: [],
  shs_course_ids: [],
};

export default function AddFacilityModal({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [tesdaCourses, setTesdaCourses] = useState([]);
  const [shsCourses, setShsCourses] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // => Load TESDA course + SHS cluster options once on mount, in parallel
  useEffect(() => {
    const loadOptions = async () => {
      setOptionsLoading(true);
      setOptionsError(null);
      try {
        //    mirroring /api/admin/tesda-courses - confirm the real path
        const [tesdaRes, shsCoursesRes] = await Promise.all([
          axiosAdmin.get('/api/admin/tesda-courses'),
          axiosAdmin.get('/api/admin/shs-courses'),
        ]);
        setTesdaCourses(tesdaRes.data.data);
        //    shape from /api/admin/shs-courses turns out different
        setShsCourses(shsCoursesRes.data.courses ?? shsCoursesRes.data.data ?? []);
      } catch (err) {
        console.error('Failed to load course/cluster options:', err);
        setOptionsError('Could not load course/cluster options. Please try again.');
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

  // => Submit the new facility - server re-validates (name required, at
  //    least one course/cluster selected unless allows_all_courses), this
  //    is just the disabled-button convenience check on the client side
  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await axiosAdmin.post('/api/admin/facilities', {
        name: form.name,
        capacity: form.capacity ? Number(form.capacity) : null,
        remarks: form.remarks?.trim() || null,
        allows_all_courses: form.allows_all_courses,
        tesda_course_ids: form.tesda_course_ids,
        shs_course_ids: form.shs_course_ids,
      });
      onCreated(res.data.facility);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create facility.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="adm-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="adm-modal-box adm-modal-box--form">

        <div className="adm-modal-header">
          <span className="adm-modal-title">Add Facility</span>
          <button className="adm-modal-close" onClick={onClose} disabled={saving}>
            <img src={closeIcon} alt="Close" />
          </button>
        </div>

        <div className="adm-modal-body">

          {/* => Facility name - required */}
          <div className="adm-form-group">
            <label className="adm-form-label">Facility Name <span className="adm-form-required">*</span></label>
            <input
              type="text"
              className="adm-form-input"
              placeholder="e.g. Computer Laboratory 1"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>

          {/* => Capacity - optional, informational only for now (not yet
                 enforced anywhere, e.g. session scheduling doesn't check
                 headcount against this) */}
          <div className="adm-form-group">
            <label className="adm-form-label">Capacity <span className="adm-form-optional">(optional)</span></label>
            <input
              type="number"
              min="1"
              className="adm-form-input"
              placeholder="e.g. 30"
              value={form.capacity}
              onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
            />
          </div>

          {/* => Remarks - optional on creation only. Once the facility
                 exists, remarks become required whenever its status changes
                 or it gets deleted (handled on the detail page instead). */}
          <div className="adm-form-group">
            <label className="adm-form-label">Remarks <span className="adm-form-optional">(optional)</span></label>
            <textarea
              className="adm-form-input"
              rows={3}
              placeholder="Optional notes about this facility…"
              value={form.remarks}
              onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
            />
          </div>

          {/* => General facility toggle - hides both checklists when on,
                 since an "allows all" facility has no restriction rows to pick */}
          <div className="facility-modal-toggle-row">
            <label className="facility-modal-toggle-label">
              <input
                type="checkbox"
                checked={form.allows_all_courses}
                onChange={e => setForm(f => ({ ...f, allows_all_courses: e.target.checked }))}
              />
              This is a general facility (allows all courses/clusters -e.g. a lecture room)
            </label>
          </div>

          {/* => Checklists only render when NOT general AND options have
                 finished loading - avoids flashing an empty list mid-fetch */}
          {!form.allows_all_courses && (
            optionsLoading ? (
              <p className="facility-modal-loading-text">Loading course options…</p>
            ) : optionsError ? (
              <p className="adm-form-error"><img className="adm-inline-icon" src={warningIcon} alt="" /> {optionsError}</p>
            ) : (
              <>
                <div className="adm-form-group">
                  <label className="adm-form-label">Allowed TESDA Courses</label>
                  <div className="facility-modal-checklist">
                    {tesdaCourses.length === 0 ? (
                      <p className="facility-modal-empty-text">No TESDA courses yet.</p>
                    ) : (
                      tesdaCourses.map(c => (
                        <label key={c.course_id} className="facility-modal-check-item">
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

                <div className="adm-form-group">
                  <label className="adm-form-label">Allowed SHS Courses</label>
                  <div className="facility-modal-checklist">
                    {shsCourses.length === 0 ? (
                      <p className="facility-modal-empty-text">No SHS courses yet.</p>
                    ) : (
                      shsCourses.map(c => (
                        <label key={c.course_id} className="facility-modal-check-item">
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
              </>
            )
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
          <button className="adm-modal-save-btn" onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? 'Creating…' : 'Create Facility'}
          </button>
        </div>

      </div>
    </div>
  );
}
