// => components/Classes/TrainerDetail/trainerDetail.jsx
// => Full-page detail/edit view for a single trainer. Mirrors
//    FacilityDetail's structure exactly - reached by clicking a row in the
//    Trainers tab table.
// => Route (needs to be added to App.jsx, same as facilities was): /dashboard/trainers/:publicId
//
// => Same split-fetch pattern as FacilityDetail: the trainer fetch and
//    the tesda-courses/shs-courses fetch are independent effects. A failed
//    options load only affects the checklists, never blocks the trainer
//    itself from displaying.

import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useParams, useNavigate } from 'react-router-dom';
import axiosAdmin from '../../../api/axiosAdmin.js';
import BackButton from '../../BackButton/BackButton.jsx';
import RemarksActionModal from '../RemarksActionModal/RemarksActionModal.jsx';
import FormActions from '../../FormActions/FormActions.jsx';
import warningIcon from '../../../assets/icons/warning.png'; //
import pencilIcon from '../../../assets/icons/pencil.png'; //
import './trainerDetail.css';

// => Philippine mobile format: must start with 09, exactly 11 digits total
const PHONE_REGEX = /^09\d{9}$/;

// => Standard broad email format - accepts gmail/icloud/yahoo/outlook/custom
//    domains alike, doesn't whitelist specific providers
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// => Formats ISO datetime to readable PH local time - same pattern used on
//    TesdaBatchDetail/ShsBatchDetail for consistency across detail pages
const formatDateTime = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export default function TrainerDetail() {
  const { publicId } = useParams();
  const navigate = useNavigate();

  const [trainer, setTrainer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // => Edit form state - separate from `trainer` (the last-saved server
  //    state) so unsaved edits don't get lost if something else re-renders
  const [form, setForm] = useState(null);

  const [tesdaCourses, setTesdaCourses] = useState([]);
  const [shsCourses, setShsCourses] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // => Controls read-only vs edit mode for the whole form card. Starts
  //    false (read-only first), same pencil-to-edit pattern as FacilityDetail.
  const [isEditing, setIsEditing] = useState(false);

  // => Status change confirmation - the select's value stays bound to
  //    form.status (not pendingStatus), so if the admin cancels, the
  //    dropdown visually reverts on its own since form.status never changed
  const [pendingStatus, setPendingStatus] = useState(null);

  // => Holds the remarks text captured from RemarksActionModal for a
  //    pending status change - staged alongside pendingStatus, not written
  //    to the database until "Save Changes" is clicked, same as every
  //    other field on this form
  const [statusChangeRemarks, setStatusChangeRemarks] = useState(null);

  // => Delete flow needs its own RemarksActionModal (remarks are always
  //    required on delete), separate from the status-change one above
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // => Loads the trainer itself. This is the ONLY fetch that can put the
  //    page into the hard "Failed to load trainer" error state.
  useEffect(() => {
    const loadTrainer = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const trainerRes = await axiosAdmin.get(`/api/admin/trainers/${publicId}`);
        const i = trainerRes.data.trainer;
        setTrainer(i);
        setForm({
          trainer_full_name: i.trainer_full_name,
          contact_number: i.contact_number,
          email: i.email ?? '',
          status: i.status,
          handles_tesda: i.handles_tesda,
          handles_shs: i.handles_shs,
          tesda_course_ids: i.tesda_course_ids,
          shs_course_ids: i.shs_course_ids,
        });
      } catch (err) {
        console.error('Failed to load trainer:', err);
        setLoadError('Failed to load trainer. It may not exist or may have been deleted.');
      } finally {
        setLoading(false);
      }
    };
    loadTrainer();
  }, [publicId]);

  // => Loads the checklist options separately - a failure here only affects
  //    the checklists (shown as optionsError below them), never blocks the
  //    trainer itself from displaying
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
        setOptionsError('Could not load course options. You can still edit the name, contact info, and status below.');
      } finally {
        setOptionsLoading(false);
      }
    };
    loadOptions();
  }, []);

  const toggleTesdaCourse = (courseId) => {
    setForm(f => ({
      ...f,
      tesda_course_ids: f.tesda_course_ids.includes(courseId)
        ? f.tesda_course_ids.filter(id => id !== courseId)
        : [...f.tesda_course_ids, courseId],
    }));
  };

  const toggleShsCourse = (courseId) => {
    setForm(f => ({
      ...f,
      shs_course_ids: f.shs_course_ids.includes(courseId)
        ? f.shs_course_ids.filter(id => id !== courseId)
        : [...f.shs_course_ids, courseId],
    }));
  };

  // => Turning a program type OFF clears its selected courses too - same
  //    reasoning as AddTrainerModal, avoids submitting stale course_ids
  const toggleHandlesTesda = (checked) => {
    setForm(f => ({ ...f, handles_tesda: checked, tesda_course_ids: checked ? f.tesda_course_ids : [] }));
  };
  const toggleHandlesShs = (checked) => {
    setForm(f => ({ ...f, handles_shs: checked, shs_course_ids: checked ? f.shs_course_ids : [] }));
  };

  // => PATCHes the trainer, replacing its course rows wholesale
  //    server-side - see updateTrainerWithCourses in adminTrainerModel.js
  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      const res = await axiosAdmin.patch(`/api/admin/trainers/${publicId}`, {
        trainer_full_name: form.trainer_full_name,
        contact_number: form.contact_number,
        email: form.email?.trim() || null,
        status: form.status,
        handles_tesda: form.handles_tesda,
        handles_shs: form.handles_shs,
        tesda_course_ids: form.tesda_course_ids,
        shs_course_ids: form.shs_course_ids,
        // => Only non-null if a status change happened this edit session -
        //    the backend leaves the stored remarks alone otherwise
        remarks: statusChangeRemarks,
      });
      setTrainer(res.data.trainer);
      toast.success('Changes saved.');
      setIsEditing(false); // => Save exits back to read-only view, same as Cancel
      setStatusChangeRemarks(null); // => Clear the staged remarks now that they're saved
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  // => Soft-deletes the trainer (sets deleted_at server-side, never a
  //    hard delete) then returns to the Classes page. Owns its own
  //    confirm/loading/error state via RemarksActionModal, since deletion
  //    always requires a remarks reason.
  // => IMPORTANT: axios DELETE requests need the body wrapped in a `data`
  //    config key - passing it as a plain second argument like a POST/PATCH
  //    body silently sends no body at all.
  const handleDelete = async (remarksText) => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await axiosAdmin.delete(`/api/admin/trainers/${publicId}`, {
        data: { remarks: remarksText },
      });
      navigate('/dashboard/classes');
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Failed to delete trainer.');
      setDeleting(false);
    }
  };

  // => Resets the form back to the last-saved trainer values - Cancel
  //    doesn't leave the page, it just discards in-progress edits
  const handleCancelEdit = () => {
    setForm({
      trainer_full_name: trainer.trainer_full_name,
      contact_number: trainer.contact_number,
      email: trainer.email ?? '',
      status: trainer.status,
      handles_tesda: trainer.handles_tesda,
      handles_shs: trainer.handles_shs,
      tesda_course_ids: trainer.tesda_course_ids,
      shs_course_ids: trainer.shs_course_ids,
    });
    setSaveError(null);
    setStatusChangeRemarks(null); // => Discard any staged status-change reason too
    setIsEditing(false); // => Cancel exits back to read-only view, not just discarding edits
  };

  if (loading) {
    return (
      <div className="trainer-page">
        <div className="trainer-state">
          <div className="trainer-spinner" />
          <p>Loading trainer…</p>
        </div>
      </div>
    );
  }

  if (loadError || !trainer) {
    return (
      <div className="trainer-page">
        <BackButton onClick={() => navigate('/dashboard/classes')} destination="Classes" />
        <div className="trainer-state trainer-state--error">
          <img className="trainer-inline-icon" src={warningIcon} alt="" />
          <p>{loadError || 'Trainer not found.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="trainer-page">
      <BackButton onClick={() => navigate('/dashboard/classes')} destination="Classes" />

      <div className="trainer-header">
        <h1 className="trainer-title">Classes | Trainers | {trainer.trainer_full_name}</h1>
        <p className="trainer-subtitle">Trainer ID #{trainer.trainer_id}</p>
      </div>

      <div className="trainer-form-card">

        {/* => Section header with the pencil-to-edit button, same role as
               FacilityDetail's .fd-section-header + .fd-section-edit-btn */}
        <div className="trainer-section-header">
          <h3 className="trainer-section-title">Trainer Details</h3>
          {!isEditing && (
            <button
              type="button"
              className="trainer-section-edit-btn"
              onClick={() => setIsEditing(true)}
            >
              <img className="trainer-pencil-icon" src={pencilIcon} alt="Edit" />
            </button>
          )}
        </div>

        {!isEditing ? (
          // => READ-ONLY VIEW - plain text, no inputs. Mirrors
          //    FacilityDetail's .fd-info-view-grid pattern.
          <>
            <div className="trainer-info-view-grid">
              <div>
                <span className="trainer-field-label">Full Name</span>
                <p className="trainer-view-value">{trainer.trainer_full_name}</p>
              </div>
              <div>
                <span className="trainer-field-label">Contact Number</span>
                <p className="trainer-view-value">{trainer.contact_number}</p>
              </div>
              <div>
                <span className="trainer-field-label">Email</span>
                <p className="trainer-view-value">{trainer.email || 'Not set'}</p>
              </div>
              <div>
                <span className="trainer-field-label">Status</span>
                <span className={`status-badge status-${trainer.status}`}>{trainer.status}</span>
              </div>
              <div>
                <span className="trainer-field-label">Handles TESDA Courses</span>
                <p className="trainer-view-value">{trainer.handles_tesda ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <span className="trainer-field-label">Handles SHS Courses</span>
                <p className="trainer-view-value">{trainer.handles_shs ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <span className="trainer-field-label">Last Updated</span>
                <p className="trainer-view-value">
                  {formatDateTime(trainer.updated_at)}
                  {trainer.updated_by_name ? ` by ${trainer.updated_by_name}` : ''}
                </p>
              </div>
            </div>

            {/* => TESDA + SHS course lists side by side, reusing the same
                   grid class as the fields above instead of stacking full-width -
                   the two-column layout was uneven when one list was much
                   longer than the other and both spanned the full width */}
            <div className="trainer-info-view-grid">

              {/* => TESDA assignment list only shown if this trainer handles TESDA */}
              {trainer.handles_tesda && (
                <div>
                  <span className="trainer-field-label">Assigned TESDA Courses</span>
                  {tesdaCourses.filter(c => trainer.tesda_course_ids.includes(c.course_id)).length === 0 ? (
                    <p className="trainer-empty-text">None assigned.</p>
                  ) : (
                    <ul className="trainer-view-list">
                      {tesdaCourses
                        .filter(c => trainer.tesda_course_ids.includes(c.course_id))
                        .map(c => (
                          <li key={c.course_id}>
                            {c.title}{c.certification_type ? ` (${c.certification_type})` : ''}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              )}

              {/* => SHS assignment list only shown if this trainer handles SHS */}
              {trainer.handles_shs && (
                <div>
                  <span className="trainer-field-label">Assigned SHS Courses</span>
                  {shsCourses.filter(c => trainer.shs_course_ids.includes(c.course_id)).length === 0 ? (
                    <p className="trainer-empty-text">None assigned.</p>
                  ) : (
                    <ul className="trainer-view-list">
                      {shsCourses
                        .filter(c => trainer.shs_course_ids.includes(c.course_id))
                        .map(c => <li key={c.course_id}>{c.title}</li>)}
                    </ul>
                  )}
                </div>
              )}

            </div>

            {/* => Shows the reason behind the trainer's current state, if
                   one was ever recorded - stays blank for trainers that
                   have never had a status change or deletion
                   => Stays below the course lists, always the last field
                      before the Delete button */}
            {trainer.remarks && (
              <div className="adm-form-group">
                <span className="trainer-field-label">Last Remarks</span>
                <p className="trainer-view-value">{trainer.remarks}</p>
              </div>
            )}

            {/* => Delete stays reachable from read-only view too, no Cancel/Save
                   needed here since nothing is being edited */}
            <div className="trainer-form-actions">
              <button
                type="button"
                className="trainer-delete-btn"
                onClick={() => setDeleteModalOpen(true)}
              >
                Delete Trainer
              </button>
            </div>
          </>
        ) : (
          // => EDIT VIEW
          <>
            <div className="adm-form-group">
              <label className="adm-form-label">Full Name <span className="adm-form-required">*</span></label>
              <input
                type="text"
                className="adm-form-input"
                value={form.trainer_full_name}
                onChange={e => setForm(f => ({ ...f, trainer_full_name: e.target.value }))}
              />
            </div>

            <div className="adm-form-row">
              <div className="adm-form-group">
                <label className="adm-form-label">Contact Number <span className="adm-form-required">*</span></label>
                <input
                  type="text"
                  className="adm-form-input"
                  inputMode="numeric"
                  maxLength={11}
                  value={form.contact_number}
                  onChange={e => {
                    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 11);
                    setForm(f => ({ ...f, contact_number: digitsOnly }));
                  }}
                />
                {form.contact_number && !PHONE_REGEX.test(form.contact_number.trim()) && (
                  <p className="adm-form-error"><img className="adm-inline-icon" src={warningIcon} alt="" /> Must start with 09 and be 11 digits long.</p>
                )}
              </div>

              <div className="adm-form-group">
                <label className="adm-form-label">Status</label>
                <select
                  className="adm-form-select"
                  value={form.status}
                  onChange={e => {
                    const nextStatus = e.target.value;
                    // => No-op if re-selecting the same value - nothing to confirm
                    if (nextStatus === form.status) return;
                    setPendingStatus(nextStatus);
                  }}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="adm-form-group">
              <label className="adm-form-label">Email <span className="adm-form-optional">(optional)</span></label>
              <input
                type="email"
                className="adm-form-input"
                maxLength={254}
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
              {form.email && !EMAIL_REGEX.test(form.email.trim()) && (
                <p className="adm-form-error"><img className="adm-inline-icon" src={warningIcon} alt="" /> Please enter a valid email address.</p>
              )}
            </div>

            <div className="trainer-toggle-row">
              <label className="trainer-toggle-label">
                <input
                  type="checkbox"
                  checked={form.handles_tesda}
                  onChange={e => toggleHandlesTesda(e.target.checked)}
                />
                Handles TESDA courses
              </label>
              <label className="trainer-toggle-label">
                <input
                  type="checkbox"
                  checked={form.handles_shs}
                  onChange={e => toggleHandlesShs(e.target.checked)}
                />
                Handles SHS courses
              </label>
            </div>

            {(form.handles_tesda || form.handles_shs) && optionsLoading && (
              <p className="trainer-loading-text">Loading course options…</p>
            )}

            {(form.handles_tesda || form.handles_shs) && !optionsLoading && optionsError && (
              <p className="adm-form-error"><img className="adm-inline-icon" src={warningIcon} alt="" /> {optionsError}</p>
            )}

            {form.handles_tesda && !optionsLoading && !optionsError && (
              <div className="adm-form-group">
                <label className="adm-form-label">Assigned TESDA Courses <span className="adm-form-required">*</span></label>
                <div className="trainer-checklist">
                  {tesdaCourses.length === 0 ? (
                    <p className="trainer-empty-text">No TESDA courses yet.</p>
                  ) : (
                    tesdaCourses.map(c => (
                      <label key={c.course_id} className="trainer-check-item">
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

            {form.handles_shs && !optionsLoading && !optionsError && (
              <div className="adm-form-group">
                <label className="adm-form-label">Assigned SHS Courses <span className="adm-form-required">*</span></label>
                <div className="trainer-checklist">
                  {shsCourses.length === 0 ? (
                    <p className="trainer-empty-text">No SHS courses yet.</p>
                  ) : (
                    shsCourses.map(c => (
                      <label key={c.course_id} className="trainer-check-item">
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

            {saveError && (
              <p className="adm-form-error"><img className="adm-inline-icon" src={warningIcon} alt="" /> {saveError}</p>
            )}

            <div className="trainer-form-actions">
              <button
                type="button"
                className="trainer-delete-btn"
                onClick={() => setDeleteModalOpen(true)}
              >
                Delete Trainer
              </button>
              <FormActions
                onCancel={handleCancelEdit}
                onSave={handleSave}
                saving={saving}
                saveDisabled={
                  !form.trainer_full_name.trim() ||
                  !form.contact_number.trim() ||
                  !PHONE_REGEX.test(form.contact_number.trim()) ||
                  (form.email.trim() && !EMAIL_REGEX.test(form.email.trim())) ||
                  (!form.handles_tesda && !form.handles_shs) ||
                  (form.handles_tesda && form.tesda_course_ids.length === 0) ||
                  (form.handles_shs && form.shs_course_ids.length === 0)
                }
              />
            </div>
          </>
        )}
      </div>

      {/* => Requires a remarks reason before the Active/Inactive change is
             staged into `form`. Only stages the value - not written to the
             database until "Save Changes" is clicked, same as every other
             field on this form. */}
      <RemarksActionModal
        isOpen={pendingStatus !== null}
        title="Change Status"
        message={
          pendingStatus === 'inactive'
            ? `Mark "${trainer.trainer_full_name}" as Inactive? They will no longer be assignable to new classes until reactivated.`
            : `Mark "${trainer.trainer_full_name}" as Active? They will become assignable to new classes again.`
        }
        confirmLabel="Confirm Status Change"
        onConfirm={(remarksText) => {
          setForm(f => ({ ...f, status: pendingStatus }));
          setStatusChangeRemarks(remarksText);
          setPendingStatus(null);
        }}
        onCancel={() => setPendingStatus(null)}
      />

      {/* => Deletion always requires remarks - no staging step here since
             delete is immediate, not part of the Save Changes flow */}
      <RemarksActionModal
        isOpen={deleteModalOpen}
        title="Delete Trainer"
        message={`Delete "${trainer.trainer_full_name}"? This can be undone later from the Trainers Deleted tab.`}
        confirmLabel="Delete Trainer"
        saving={deleting}
        error={deleteError}
        onConfirm={(remarksText) => {
          setDeleteModalOpen(false);
          handleDelete(remarksText);
        }}
        onCancel={() => { setDeleteModalOpen(false); setDeleteError(null); }}
      />
    </div>
  );
}
