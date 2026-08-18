// => components/Classes/AddBatchModal/addBatchModal.jsx
// => Extracted from Classes.jsx, which originally built this inline instead
//    of as its own component (unlike AddFacilityModal/addTrainerModal/
//    addSessionModal, which all already lived in their own files). Mirrors
//    addSessionModal.jsx's pattern: one file, internal Program Type toggle
//    (TESDA/SHS) instead of two separate modal components.
// => FIX: the TESDA/SHS toggle button used to call setFormError(null) on
//    click, but formError/setFormError was never declared anywhere in the
//    old Classes.jsx state - that was a dead reference that would have
//    thrown a ReferenceError the moment someone clicked the toggle. Removed
//    here since errors are already surfaced via toast, no local formError
//    state is needed.
// => NOTE: this modal now fetches its own /form-options independently on
//    open, instead of also warming Classes.jsx's separate More Options
//    filter cache as a side effect like the old handleOpenModal did. That
//    cross-population is dropped intentionally - decoupling the modal means
//    it can no longer reach into the parent's filterOptionsCache ref. Minor
//    behavior change: opening this modal first no longer pre-warms the
//    Batches tab's More Options dropdowns: they'll just fetch on their own
//    the first time that panel is opened, same as before this modal ever
//    existed.

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import axiosAdmin from '../../../utils/axiosAdmin.js';

import closeIcon from '../../../assets/icons/close.png';

import './addBatchModal.css';

// => Initial state for the Add TESDA Batch form
const EMPTY_CLASS_FORM = {
  course_id:                   '',
  trainer_id:                  '',
  start_date:                  '',
  end_date:                    '',
  required_number_of_students: '',
  max_students:                '',
  max_applicants:              '',
  remarks:                     '',
};

// => Initial state for the Add SHS Batch form - separate shape from
//    EMPTY_CLASS_FORM since SHS batches use cluster_id + per-course
//    trainers instead of a single course_id + single trainer_id
const EMPTY_SHS_BATCH_FORM = {
  cluster_id:                  '',
  school_year:                 '',
  // => keyed by course_id (string) -> trainer_id (string), one entry per
  //    course under the selected cluster
  course_trainers:             {},
  start_date:                  '',
  end_date:                    '',
  required_number_of_students: '',
  max_students:                '',
  max_applicants:              '',
  remarks:                     '',
};

// => Returns tomorrow as a YYYY-MM-DD string, for the Start Date input's
//    min attribute - matches the backend's validateBatchDates, which
//    disallows today or earlier as a start date
const getTomorrowDateString = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

// => Returns the earliest allowed End Date for a given Start Date value -
//    the day after start_date, or tomorrow if start_date isn't set yet
const getMinEndDate = (startDateValue) => {
  if (!startDateValue) return getTomorrowDateString();
  const d = new Date(startDateValue);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

// => Client-side mirror of the backend's validateBatchDates - this form
//    isn't a native <form> submission, so the date input's min attribute
//    alone never blocks a typed-in invalid date on submit. This catches it
//    before the request goes out.
const validateBatchDatesClient = (startDate, endDate) => {
  if (startDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    if (start <= today) {
      return 'Start date must be a future date - today or earlier is not allowed.';
    }
  }
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end <= start) {
      return 'End date must be after the start date.';
    }
  }
  return null;
};

export default function AddBatchModal({ onClose, onCreated }) {
  const navigate = useNavigate();

  const [createType,   setCreateType]   = useState('TESDA'); // => 'TESDA' | 'SHS'
  const [formOptions,  setFormOptions]  = useState({ courses: [], trainers: [], clusters: [] });
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [classForm,    setClassForm]    = useState(EMPTY_CLASS_FORM);
  const [shsBatchForm, setShsBatchForm] = useState(EMPTY_SHS_BATCH_FORM);
  const [formSaving,   setFormSaving]   = useState(false);

  // => Fetch form options once, on mount - replaces the old handleOpenModal
  useEffect(() => {
    const loadOptions = async () => {
      setOptionsLoading(true);
      try {
        const res = await axiosAdmin.get('/api/admin/batches/form-options');
        setFormOptions(res.data);
      } catch (err) {
        toast.error('Could not load form options. Please try again.');
      } finally {
        setOptionsLoading(false);
      }
    };
    loadOptions();
  }, []);

  const handleClose = () => {
    if (formSaving) return; // => prevent close mid-save
    onClose();
  };

  // => Submit the new TESDA batch form
  const handleCreateClass = async () => {
    const dateError = validateBatchDatesClient(classForm.start_date, classForm.end_date);
    if (dateError) {
      toast.error(dateError);
      return;
    }

    setFormSaving(true);

    try {
      const res = await axiosAdmin.post('/api/admin/batches/tesda', {
        ...classForm,
        course_id:                    Number(classForm.course_id),
        trainer_id:                   classForm.trainer_id ? Number(classForm.trainer_id) : null,
        required_number_of_students:  Number(classForm.required_number_of_students),
        max_students:                 Number(classForm.max_students),
        max_applicants:               Number(classForm.max_applicants),
      });

      // => Close modal and navigate straight to the new batch's detail page
      onCreated?.();
      onClose();
      navigate(`/dashboard/classes/tesda/${res.data.batch.public_id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create batch.');
    } finally {
      setFormSaving(false);
    }
  };

  // => Submit the new SHS batch form
  const handleCreateShsBatch = async () => {
    const dateError = validateBatchDatesClient(shsBatchForm.start_date, shsBatchForm.end_date);
    if (dateError) {
      toast.error(dateError);
      return;
    }

    setFormSaving(true);

    // => Turns the { course_id: trainer_id } map back into the
    //    [{ course_id, trainer_id }] array shape the backend expects
    const course_trainers = Object.entries(shsBatchForm.course_trainers)
      .map(([course_id, trainer_id]) => ({
        course_id: Number(course_id),
        trainer_id: trainer_id ? Number(trainer_id) : null,
      }));

    try {
      const res = await axiosAdmin.post('/api/admin/batches/shs', {
        ...shsBatchForm,
        cluster_id:                   Number(shsBatchForm.cluster_id),
        required_number_of_students:  Number(shsBatchForm.required_number_of_students),
        max_students:                 Number(shsBatchForm.max_students),
        max_applicants:                Number(shsBatchForm.max_applicants),
        course_trainers,
      });

      onCreated?.();
      onClose();
      navigate(`/dashboard/classes/shs/${res.data.batch.public_id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create batch.');
    } finally {
      setFormSaving(false);
    }
  };

  return (
    <div className="adm-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="adm-modal-box adm-modal-box--form">

        <div className="adm-modal-header">
          <span className="adm-modal-title">Add New Batch</span>
          <button className="adm-modal-close" onClick={handleClose} disabled={formSaving}>
            <img src={closeIcon} alt="Close" />
          </button>
        </div>

        <div className="adm-modal-body">

          {/* => Program Type toggle - picks which form below is shown and
                 which endpoint Create Batch posts to */}
          <div className="adm-form-group">
            <label className="adm-form-label">Program Type</label>
            <div className="adm-modal-type-toggle">
              {['TESDA', 'SHS'].map(t => (
                <button
                  key={t}
                  type="button"
                  className={`adm-filter-btn ${createType === t ? 'adm-filter-btn--active' : ''}`}
                  onClick={() => setCreateType(t)}
                  disabled={formSaving}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {optionsLoading ? (
            <p className="adm-empty-note">Loading form options…</p>
          ) : createType === 'TESDA' ? (
            <>
              {/* => Course */}
              <div className="adm-form-group">
                <label className="adm-form-label">Course <span className="adm-form-required">*</span></label>
                <select
                  className="adm-form-select"
                  value={classForm.course_id}
                  onChange={e => setClassForm(f => ({ ...f, course_id: e.target.value }))}
                >
                  <option value="">- Select a course -</option>
                  {formOptions.courses.map(c => (
                    <option key={c.course_id} value={c.course_id}>
                      {c.title}{c.certification_type ? ` (${c.certification_type})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* => Trainer (optional - nullable per schema) - assigning an
                     unqualified trainer here is a hard error on the
                     backend, not a confirm prompt */}
              <div className="adm-form-group">
                <label className="adm-form-label">Trainer <span className="adm-form-optional">(optional)</span></label>
                <select
                  className="adm-form-select"
                  value={classForm.trainer_id}
                  onChange={e => setClassForm(f => ({ ...f, trainer_id: e.target.value }))}
                >
                  <option value="">- Assign later -</option>
                  {formOptions.trainers
                    .filter(i =>
                      !classForm.course_id ||
                      (formOptions.trainerTesdaCourses || []).some(row =>
                        String(row.trainer_id) === String(i.trainer_id) &&
                        String(row.course_id) === String(classForm.course_id)
                      )
                    )
                    .map(i => (
                      <option key={i.trainer_id} value={i.trainer_id}>{i.trainer_full_name}</option>
                    ))}
                </select>
              </div>

              {/* => Start Date + End Date side by side - both optional */}
              <div className="adm-form-row">
                <div className="adm-form-group">
                  <label className="adm-form-label">Start Date <span className="adm-form-optional">(optional)</span></label>
                  <input
                    type="date"
                    className="adm-form-input"
                    min={getTomorrowDateString()}
                    value={classForm.start_date}
                    onChange={e => setClassForm(f => ({ ...f, start_date: e.target.value }))}
                  />
                </div>

                <div className="adm-form-group">
                  <label className="adm-form-label">End Date <span className="adm-form-optional">(optional)</span></label>
                  <input
                    type="date"
                    className="adm-form-input"
                    min={getMinEndDate(classForm.start_date)}
                    value={classForm.end_date}
                    onChange={e => setClassForm(f => ({ ...f, end_date: e.target.value }))}
                  />
                </div>
              </div>

              {/* => Required Students + Max Students side by side */}
              <div className="adm-form-row">
                <div className="adm-form-group">
                  <label className="adm-form-label">Required Students <span className="adm-form-required">*</span></label>
                  <input
                    type="number"
                    className="adm-form-input"
                    min="1"
                    placeholder="e.g. 10"
                    value={classForm.required_number_of_students}
                    onChange={e => setClassForm(f => ({ ...f, required_number_of_students: e.target.value }))}
                  />
                </div>

                <div className="adm-form-group">
                  <label className="adm-form-label">Max Students <span className="adm-form-required">*</span></label>
                  <input
                    type="number"
                    className="adm-form-input"
                    min="1"
                    placeholder="e.g. 25"
                    value={classForm.max_students}
                    onChange={e => setClassForm(f => ({ ...f, max_students: e.target.value }))}
                  />
                </div>
              </div>

              {/* => Max Applicant Pool - caps total enrollment attempts
                     (any status except Rejected/Dropped), separate from
                     Max Students which caps Approved only */}
              <div className="adm-form-group">
                <label className="adm-form-label">Max Applicant Pool <span className="adm-form-required">*</span></label>
                <input
                  type="number"
                  className="adm-form-input"
                  min="1"
                  placeholder="e.g. 50"
                  value={classForm.max_applicants}
                  onChange={e => setClassForm(f => ({ ...f, max_applicants: e.target.value }))}
                />
              </div>

              {/* => Remarks (optional) */}
              <div className="adm-form-group">
                <label className="adm-form-label">Remarks <span className="adm-form-optional">(optional)</span></label>
                <textarea
                  className="adm-form-textarea"
                  rows={3}
                  placeholder="Any notes about this batch…"
                  value={classForm.remarks}
                  onChange={e => setClassForm(f => ({ ...f, remarks: e.target.value }))}
                />
              </div>
            </>
          ) : (
            <>
              {/* => Cluster */}
              <div className="adm-form-group">
                <label className="adm-form-label">Cluster <span className="adm-form-required">*</span></label>
                <select
                  className="adm-form-select"
                  value={shsBatchForm.cluster_id}
                  onChange={e => setShsBatchForm(f => ({ ...f, cluster_id: e.target.value }))}
                >
                  <option value="">- Select a cluster -</option>
                  {formOptions.clusters.map(c => (
                    <option key={c.cluster_id} value={c.cluster_id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* => School Year */}
              <div className="adm-form-group">
                <label className="adm-form-label">School Year <span className="adm-form-required">*</span></label>
                <input
                  type="text"
                  className="adm-form-input"
                  placeholder="e.g. 2026-2027"
                  value={shsBatchForm.school_year}
                  onChange={e => setShsBatchForm(f => ({ ...f, school_year: e.target.value }))}
                />
              </div>

              {/* => One trainer dropdown per course, not per grade level - a
                     cluster can hold more than one course per grade, each
                     needing its own qualified trainer. Also doubles as a
                     read-only "what courses does this cluster have" view. */}
              {shsBatchForm.cluster_id && (
                <div className="adm-form-group">
                  <label className="adm-form-label">Course Trainers <span className="adm-form-optional">(optional)</span></label>
                  {['Grade 11', 'Grade 12'].map(grade => {
                    const coursesForGrade = (formOptions.shsCourses || []).filter(
                      c => String(c.cluster_id) === String(shsBatchForm.cluster_id) && c.grade_level === grade
                    );
                    if (coursesForGrade.length === 0) {
                      return (
                        <div key={grade} className="adm-course-trainer-grade-group">
                          <span className="adm-cluster-courses-grade">{grade}</span>
                          <p className="adm-empty-note">No courses set up for {grade} yet.</p>
                        </div>
                      );
                    }
                    return (
                      <div key={grade} className="adm-course-trainer-grade-group">
                        <span className="adm-cluster-courses-grade">{grade}</span>
                        {coursesForGrade.map(c => {
                          const qualifiedTrainers = formOptions.trainers.filter(t =>
                            (formOptions.trainerShsCourses || []).some(row =>
                              String(row.trainer_id) === String(t.trainer_id) &&
                              String(row.course_id) === String(c.course_id)
                            )
                          );
                          return (
                            <div key={c.course_id} className="adm-course-trainer-row">
                              <label className="adm-form-label adm-form-label--sub">{c.title}</label>
                              <select
                                className="adm-form-select"
                                value={shsBatchForm.course_trainers[c.course_id] || ''}
                                onChange={e => setShsBatchForm(f => ({
                                  ...f,
                                  course_trainers: { ...f.course_trainers, [c.course_id]: e.target.value },
                                }))}
                              >
                                <option value="">- Assign later -</option>
                                {qualifiedTrainers.map(t => (
                                  <option key={t.trainer_id} value={t.trainer_id}>{t.trainer_full_name}</option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* => Start Date + End Date side by side - both optional */}
              <div className="adm-form-row">
                <div className="adm-form-group">
                  <label className="adm-form-label">Start Date <span className="adm-form-optional">(optional)</span></label>
                  <input
                    type="date"
                    className="adm-form-input"
                    min={getTomorrowDateString()}
                    value={shsBatchForm.start_date}
                    onChange={e => setShsBatchForm(f => ({ ...f, start_date: e.target.value }))}
                  />
                </div>

                <div className="adm-form-group">
                  <label className="adm-form-label">End Date <span className="adm-form-optional">(optional)</span></label>
                  <input
                    type="date"
                    className="adm-form-input"
                    min={getMinEndDate(shsBatchForm.start_date)}
                    value={shsBatchForm.end_date}
                    onChange={e => setShsBatchForm(f => ({ ...f, end_date: e.target.value }))}
                  />
                </div>
              </div>

              {/* => Required Students + Max Students side by side */}
              <div className="adm-form-row">
                <div className="adm-form-group">
                  <label className="adm-form-label">Required Students <span className="adm-form-required">*</span></label>
                  <input
                    type="number"
                    className="adm-form-input"
                    min="1"
                    placeholder="e.g. 10"
                    value={shsBatchForm.required_number_of_students}
                    onChange={e => setShsBatchForm(f => ({ ...f, required_number_of_students: e.target.value }))}
                  />
                </div>

                <div className="adm-form-group">
                  <label className="adm-form-label">Max Students <span className="adm-form-required">*</span></label>
                  <input
                    type="number"
                    className="adm-form-input"
                    min="1"
                    placeholder="e.g. 40"
                    value={shsBatchForm.max_students}
                    onChange={e => setShsBatchForm(f => ({ ...f, max_students: e.target.value }))}
                  />
                </div>
              </div>

              {/* => Max Applicant Pool */}
              <div className="adm-form-group">
                <label className="adm-form-label">Max Applicant Pool <span className="adm-form-required">*</span></label>
                <input
                  type="number"
                  className="adm-form-input"
                  min="1"
                  placeholder="e.g. 60"
                  value={shsBatchForm.max_applicants}
                  onChange={e => setShsBatchForm(f => ({ ...f, max_applicants: e.target.value }))}
                />
              </div>

              {/* => Remarks (optional) */}
              <div className="adm-form-group">
                <label className="adm-form-label">Remarks <span className="adm-form-optional">(optional)</span></label>
                <textarea
                  className="adm-form-textarea"
                  rows={3}
                  placeholder="Any notes about this batch…"
                  value={shsBatchForm.remarks}
                  onChange={e => setShsBatchForm(f => ({ ...f, remarks: e.target.value }))}
                />
              </div>
            </>
          )}

        </div>

        <div className="adm-modal-footer">
          <button className="adm-modal-cancel-btn" onClick={handleClose} disabled={formSaving}>
            Cancel
          </button>
          <button
            className="adm-modal-save-btn"
            onClick={createType === 'TESDA' ? handleCreateClass : handleCreateShsBatch}
            disabled={formSaving || optionsLoading}
          >
            {formSaving ? 'Creating…' : 'Create Batch'}
          </button>
        </div>

      </div>
    </div>
  );
}