// => admin/components/Classes/ShsBatchDetail/ShsBatchDetail.jsx
// => Full detail view for a single SHS batch
// => Split from the old shared ClassDetail.jsx - SHS has a materially
//    different shape (cluster instead of course/sector, two trainer slots
//    instead of one) so this stays its own component rather than
//    branching inside one shared file
// => Edit mode follows the exact same SectionEditControls pattern used on
//    tesdaEnrollmentDetail.jsx / TesdaBatchDetail.jsx: one section editable
//    at a time, pencil toggles to Save/Cancel, draft state holds
//    in-progress values.

import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useParams, useNavigate } from 'react-router-dom';
import axiosAdmin from '../../../api/axiosAdmin.js';
import BackButton from '../../BackButton/BackButton.jsx';
import ConfirmModal from '../../ConfirmModal/ConfirmModal.jsx';
import pencilIcon from '../../../assets/icons/pencil.png';

import './ShsBatchDetail.css';

const statusClass = {
  'Pending':   'status--pending',
  'Ongoing':   'status--ongoing',
  'Concluded': 'status--concluded',
  'Dissolved': 'status--dissolved',
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const datePart = String(dateStr).slice(0, 10);
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const toDateInputValue = (dateStr) => {
  if (!dateStr) return '';
  return String(dateStr).slice(0, 10);
};

const getTomorrowDateString = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

const getMinEndDate = (startDateValue) => {
  if (!startDateValue) return getTomorrowDateString();
  const d = new Date(startDateValue);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

const validateDatesClient = (startDate, endDate) => {
  if (startDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    if (start <= today) return 'Start date must be a future date - today or earlier is not allowed.';
  }
  if (startDate && endDate) {
    if (new Date(endDate) <= new Date(startDate)) return 'End date must be after the start date.';
  }
  return null;
};

// => Uses last_name, matching the actual student_profile column
const fullName = (row) => {
  const parts = [row.first_name, row.middle_name, row.last_name, row.name_extension]
    .filter(v => v && v.trim().toUpperCase() !== 'N/A');
  return parts.length ? parts.join(' ') : row.student_email ?? '-';
};

const enrollmentStatusClass = {
  'Pending':             'status--pending',
  'Approved':            'status--approved',
  'Needs Clarification': 'status--clarification',
  'Rejected':            'status--rejected',
  'Dropped':             'status--dropped',
  'Completed':           'status--completed',
  'Reserved':            'status--reserved',
};

// => Same SectionEditControls pattern as TesdaBatchDetail.jsx / tesdaEnrollmentDetail.jsx
function SectionEditControls({ sectionKey, editingSection, saving, onEdit, onSave, onCancel }) {
  const isEditing = editingSection === sectionKey;
  return (
    <div className="adm-section-actions">
      {isEditing ? (
        <>
          <button className="adm-section-save-btn" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="adm-section-cancel-btn" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        </>
      ) : (
        <button className="adm-section-edit-btn" onClick={onEdit} title="Edit section">
          <img src={pencilIcon} alt="Edit" className="adm-pencil-icon" />
        </button>
      )}
    </div>
  );
}

export default function ShsBatchDetail() {
  const { publicId } = useParams();
  const navigate      = useNavigate();

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const [selectedStatus, setSelectedStatus] = useState('');
  const [statusRemarks,  setStatusRemarks]  = useState('');
  const [statusSaving,   setStatusSaving]   = useState(false);

  // => Gate for the Concluded status - admin must confirm they've already
  //    talked to the trainer before the actual PATCH fires
  const [showConcludeConfirm, setShowConcludeConfirm] = useState(false);

  // => Only one section editable at a time - 'batchInfo' covers Batch
  //    Information + both trainer slots together, since all of it saves
  //    through the same PATCH /api/admin/batches/shs/:publicId endpoint.
  //    cluster is never part of the draft - permanently locked.
  const [editingSection, setEditingSection] = useState(null);
  const [draft,          setDraft]          = useState({});
  const [sectionSaving,  setSectionSaving]  = useState(false);
  const [sectionError,   setSectionError]   = useState(null);

  const [trainerOptions,  setTrainerOptions]  = useState([]);
  const [loadingTrainers, setLoadingTrainers] = useState(false);

  useEffect(() => {
    if (editingSection !== 'batchInfo') return;
    setLoadingTrainers(true);
    fetch('/api/admin/batches/form-options', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setTrainerOptions(d.trainers || []))
      .catch(err => console.error('Failed to fetch trainer options:', err))
      .finally(() => setLoadingTrainers(false));
  }, [editingSection]);

  // => Only trainerShsCourses is still needed here - course/trainer
  //    assignments themselves now come from data.courseTrainers in the
  //    batch detail response, this fetch is purely for qualification
  //    filtering in the edit-mode dropdowns.
  const [clusterCourseData, setClusterCourseData] = useState({ trainerShsCourses: [] });

  useEffect(() => {
    fetch('/api/admin/batches/form-options', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setClusterCourseData({ trainerShsCourses: d.trainerShsCourses || [] }))
      .catch(err => console.error('Failed to fetch trainer qualification data:', err));
  }, []);

  // => Activity log for this batch - status changes, edits, and the
  //    automatic System-driven Ongoing promotion all show up here
  const [logs,        setLogs]        = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/admin/batches/shs/${publicId}/logs`, {
        credentials: 'include',
      });
      if (!res.ok) return;
      const json = await res.json();
      setLogs(json.logs || []);
    } catch (err) {
      console.error('Failed to fetch batch logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  // => Every session booked for this batch, across all facilities and
  //    types (Local/Mobile/Online) - resolved server-side from this page's
  //    batch public_id
  const [classSessions, setClassSessions] = useState([]);
  const [classSessionsLoading, setClassSessionsLoading] = useState(false);

  const fetchClassSessions = async () => {
    setClassSessionsLoading(true);
    try {
      const res = await axiosAdmin.get(`/api/admin/class-sessions/batch/shs/${publicId}`);
      setClassSessions(res.data.sessions || []);
    } catch (err) {
      console.error('Failed to fetch class sessions:', err);
    } finally {
      setClassSessionsLoading(false);
    }
  };

  // => TIME columns come back as 'HH:MM:SS' - trims to 'HH:MM' for display
  const formatTime = (timeStr) => {
    if (!timeStr) return '-';
    return String(timeStr).slice(0, 5);
  };

  // => silent=true skips the full-page loading spinner - used when
  //    re-fetching after a save, where the page is already showing content
  const fetchDetail = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/batches/shs/${publicId}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Failed to fetch batch detail.');
      }
      const json = await res.json();
      setData(json);
      setSelectedStatus(json.batchRow.status);
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
    fetchLogs();
    fetchClassSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicId]);

  const startEdit = (sectionKey, initialValues) => {
    setEditingSection(sectionKey);
    setDraft(initialValues);
    setSectionError(null);
  };

  const cancelEdit = () => {
    setEditingSection(null);
    setDraft({});
    setSectionError(null);
  };

  const updateDraft = (field, value) => {
    setDraft(prev => ({ ...prev, [field]: value }));
  };

  const handleEditBatchInfo = () => {
    const { batchRow, courseTrainers } = data;
    // => Keyed by course_id (string) -> trainer_id (string), same shape
    //    the Add Batch modal in Classes.jsx uses
    const courseTrainerMap = {};
    (courseTrainers || []).forEach(c => {
      courseTrainerMap[c.course_id] = c.trainer_id ?? '';
    });
    startEdit('batchInfo', {
      start_date:                   toDateInputValue(batchRow.start_date),
      end_date:                     toDateInputValue(batchRow.end_date),
      required_number_of_students:  batchRow.required_number_of_students ?? '',
      max_students:                 batchRow.max_students ?? '',
      course_trainers:              courseTrainerMap,
      groupchat_link:               batchRow.groupchat_link ?? '',
    });
  };

  // => Trainer qualification is now a hard block, matching TESDA - the
  //    Grade 11/12 dropdowns only ever offer actually-qualified trainers,
  //    so this is a plain save with no confirm-flow needed.
  const submitBatchInfo = async () => {
    setSectionError(null);

    if (!draft.required_number_of_students || !draft.max_students) {
      setSectionError('Required Students and Max Students are both required.');
      return;
    }
    if (Number(draft.required_number_of_students) > Number(draft.max_students)) {
      setSectionError('Required Students cannot exceed Max Students.');
      return;
    }
    const dateError = validateDatesClient(draft.start_date, draft.end_date);
    if (dateError) {
      setSectionError(dateError);
      return;
    }

    const course_trainers = Object.entries(draft.course_trainers || {}).map(([course_id, trainer_id]) => ({
      course_id: Number(course_id),
      trainer_id: trainer_id ? Number(trainer_id) : null,
    }));

    setSectionSaving(true);
    try {
      await axiosAdmin.patch(`/api/admin/batches/shs/${publicId}`, {
        start_date:                   draft.start_date || null,
        end_date:                     draft.end_date || null,
        required_number_of_students:  Number(draft.required_number_of_students),
        max_students:                 Number(draft.max_students),
        course_trainers,
        groupchat_link:               draft.groupchat_link?.trim() || null,
      });

      // => Re-fetch instead of merging the PATCH response - UPDATE...RETURNING
      //    only returns raw columns like grade11_trainer_id, not the joined
      //    grade11_trainer_name, so a merge left the old trainer info
      //    showing until a manual page refresh
      await fetchDetail(true);
      await fetchLogs();
      setEditingSection(null);
      setDraft({});
      toast.success('Batch updated successfully.');
    } catch (err) {
      setSectionError(err.response?.data?.error || 'Failed to save changes.');
    } finally {
      setSectionSaving(false);
    }
  };

  const handleSaveBatchInfo = () => submitBatchInfo();

  // => Switched from plain fetch to axiosAdmin - same latent CSRF bug fixed
  //    earlier in Facility/Instructor restore. Remarks are required on
  //    every status change, matching Facility/Trainer's convention.
  // => Does the actual PATCH - split out so the Concluded confirm gate
  //    below can call this after the admin says Yes, without duplicating
  //    the request logic
  const runStatusSave = async () => {
    setStatusSaving(true);
    try {
      const res = await axiosAdmin.patch(`/api/admin/batches/shs/${publicId}/status`, {
        status: selectedStatus,
        remarks: statusRemarks.trim(),
      });

      setData(prev => ({
        ...prev,
        batchRow: { ...prev.batchRow, status: res.data.updated.status, remarks: statusRemarks.trim() },
      }));
      await fetchLogs();
      setStatusRemarks('');
      toast.success('Status updated successfully.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update status.');
    } finally {
      setStatusSaving(false);
    }
  };

  const handleSaveStatus = () => {
    if (!selectedStatus || selectedStatus === data?.batchRow.status) return;

    if (!statusRemarks.trim()) {
      toast.error('Remarks are required when changing the batch status.');
      return;
    }

    // => Concluded needs an extra confirmation step - the PATCH only
    //    fires once the admin confirms they've consulted the trainer
    if (selectedStatus === 'Concluded') {
      setShowConcludeConfirm(true);
      return;
    }

    runStatusSave();
  };

  const handleConfirmConclude = () => {
    setShowConcludeConfirm(false);
    runStatusSave();
  };

  // => Marking Grade 11 complete is one-way in this UI (no undo button), so
  //    it goes through the same confirm-gate pattern as Concluded above, as
  //    its own independent state rather than reusing showConcludeConfirm.
  //    Hits a dedicated endpoint, not the generic batch-info PATCH, since
  //    that one requires the full form (required_number_of_students etc.)
  //    on every call.
  const [showGrade11CompleteConfirm, setShowGrade11CompleteConfirm] = useState(false);
  const [grade11CompleteSaving,      setGrade11CompleteSaving]      = useState(false);

  const runMarkGrade11Complete = async () => {
    setGrade11CompleteSaving(true);
    try {
      await axiosAdmin.patch(`/api/admin/batches/shs/${publicId}/grade11-completed`);
      await fetchDetail(true);
      await fetchLogs();
      toast.success('Grade 11 marked as completed.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update Grade 11 status.');
    } finally {
      setGrade11CompleteSaving(false);
      setShowGrade11CompleteConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="adm-shs-batch-detail-page">
        <div className="adm-batch-detail-state">
          <div className="adm-spinner" />
          <p>Loading batch details…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="adm-shs-batch-detail-page">
        <BackButton destination="Classes" onClick={() => navigate('/dashboard/classes')} />
        <div className="adm-batch-detail-state adm-batch-detail-state--error">
          <span>⚠ {error}</span>
        </div>
      </div>
    );
  }

  const { batchRow, enrolledStudents } = data;
  const remainingSlots = batchRow.max_students - (enrolledStudents?.length ?? 0);
  const isEditingBatchInfo = editingSection === 'batchInfo';

  // => Per-course trainer assignments, straight from the API - replaces
  //    the old shsCourses-filtered-by-cluster derivation, since
  //    data.courseTrainers already comes back scoped to this batch's
  //    cluster with trainer_id/trainer_full_name attached
  const courseTrainers = data.courseTrainers || [];
  const grade11CourseTrainers = courseTrainers.filter(c => c.grade_level === 'Grade 11');
  const grade12CourseTrainers = courseTrainers.filter(c => c.grade_level === 'Grade 12');

  // => Trainers qualified for one specific course, not a whole grade level -
  //    each course under the cluster gets its own filtered dropdown now,
  //    since a cluster can hold more than one course per grade
  const getQualifiedTrainersForCourse = (courseId) => {
    const qualifiedIds = clusterCourseData.trainerShsCourses
      .filter(tc => tc.course_id === courseId)
      .map(tc => tc.trainer_id);
    return trainerOptions.filter(t => qualifiedIds.includes(t.trainer_id));
  };

  return (
    <div className="adm-shs-batch-detail-page">

      <BackButton destination="Classes" onClick={() => navigate('/dashboard/classes')} />

      <div className="adm-batch-detail-body">

        {/* HERO HEADER - shows cluster as the main title, no track anywhere */}
        <div className="adm-batch-detail-hero">
          <div className="adm-hero-left">
            <p className="adm-hero-sector">SHS Batch</p>
            <h1 className="adm-hero-course-name">{batchRow.cluster ?? '-'} (Batch #{batchRow.batch_sequence ?? batchRow.batch_id})</h1>
          </div>

          <span className={`adm-hero-badge ${statusClass[batchRow.status] || ''}`}>
            {batchRow.status}
          </span>
        </div>

        {/* STATUS CHANGER */}
        <div className="adm-batch-section">
          <p className="adm-section-title">Update Status</p>
          <div className="adm-status-changer">
            <select
              className="adm-status-select"
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
            >
              <option value="Pending">Pending</option>
              <option value="Ongoing">Ongoing</option>
              <option value="Concluded">Concluded</option>
              <option value="Dissolved">Dissolved</option>
            </select>

            <input
              type="text"
              className="adm-status-remarks-input"
              placeholder="Remarks (required)"
              value={statusRemarks}
              onChange={e => setStatusRemarks(e.target.value)}
            />

            <button
              className="adm-status-btn"
              onClick={handleSaveStatus}
              disabled={statusSaving || selectedStatus === batchRow.status}
            >
              {statusSaving ? 'Saving…' : 'Save Status'}
            </button>
          </div>
        </div>

        {/* BATCH INFO - one editable section covering both trainer slots.
               cluster is always plain text, never part of the draft. */}
        <div className="adm-batch-section">
          <div className="adm-section-header">
            <p className="adm-section-title">Batch Information</p>
            <SectionEditControls
              sectionKey="batchInfo"
              editingSection={editingSection}
              saving={sectionSaving}
              onEdit={handleEditBatchInfo}
              onSave={handleSaveBatchInfo}
              onCancel={cancelEdit}
            />
          </div>

          {isEditingBatchInfo && sectionError && (
            <p className="adm-form-error">⚠ {sectionError}</p>
          )}

          {!isEditingBatchInfo ? (
            <div className="adm-info-grid">

              <div className="adm-info-card">
                <p className="adm-info-label">Cluster</p>
                <p className="adm-info-value">{batchRow.cluster ?? '-'}</p>
              </div>

              <div className="adm-info-card">
                <p className="adm-info-label">Grade 11 Courses & Trainers</p>
                {grade11CourseTrainers.length === 0 ? (
                  <p className="adm-info-value">-</p>
                ) : (
                  <ul className="adm-modal-course-list">
                    {grade11CourseTrainers.map(c => (
                      <li key={c.course_id}>{c.course_title} — {c.trainer_full_name ?? 'Unassigned'}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="adm-info-card">
                <p className="adm-info-label">Grade 11 Status</p>
                {batchRow.grade11_completed ? (
                  <span className="adm-badge status--completed">Completed</span>
                ) : (
                  <>
                    <p className="adm-info-value" style={{ marginBottom: 8 }}>In Progress</p>
                    <button
                      className="adm-status-btn"
                      style={{ padding: '5px 12px', fontSize: '0.75rem' }}
                      onClick={() => setShowGrade11CompleteConfirm(true)}
                      disabled={grade11CompleteSaving}
                    >
                      {grade11CompleteSaving ? 'Saving…' : 'Mark as Completed'}
                    </button>
                  </>
                )}
              </div>

              <div className="adm-info-card">
                <p className="adm-info-label">Grade 12 Courses & Trainers</p>
                {grade12CourseTrainers.length === 0 ? (
                  <p className="adm-info-value">-</p>
                ) : (
                  <ul className="adm-modal-course-list">
                    {grade12CourseTrainers.map(c => (
                      <li key={c.course_id}>{c.course_title} — {c.trainer_full_name ?? 'Unassigned'}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="adm-info-card">
                <p className="adm-info-label">Start Date</p>
                <p className="adm-info-value">{formatDate(batchRow.start_date)}</p>
              </div>

              <div className="adm-info-card">
                <p className="adm-info-label">End Date</p>
                <p className="adm-info-value">{formatDate(batchRow.end_date)}</p>
              </div>

              <div className="adm-info-card">
                <p className="adm-info-label">Required Students</p>
                <p className="adm-info-value">{batchRow.required_number_of_students ?? '-'}</p>
              </div>

              <div className="adm-info-card">
                <p className="adm-info-label">Max Students</p>
                <p className="adm-info-value">{batchRow.max_students ?? '-'}</p>
              </div>

              <div className="adm-info-card">
                <p className="adm-info-label">Enrolled</p>
                <p className="adm-info-value">
                  {enrolledStudents?.length ?? 0}
                  {' '}
                  <span className="adm-slots-note">
                    ({remainingSlots > 0 ? `${remainingSlots} slot${remainingSlots !== 1 ? 's' : ''} remaining` : 'Full'})
                  </span>
                </p>
              </div>

              {batchRow.groupchat_link && (
                <div className="adm-info-card">
                  <p className="adm-info-label">Groupchat</p>
                  <p className="adm-info-value">
                    <a href={batchRow.groupchat_link} target="_blank" rel="noopener noreferrer" className="adm-info-link">
                      Open Groupchat
                    </a>
                  </p>
                </div>
              )}

              <div className="adm-info-card">
                <p className="adm-info-label">Last Updated</p>
                <p className="adm-info-value">{formatDateTime(batchRow.updated_at)}</p>
              </div>

              {batchRow.created_by_name && (
                <div className="adm-info-card">
                  <p className="adm-info-label">Created By</p>
                  <p className="adm-info-value">{batchRow.created_by_name}</p>
                </div>
              )}

            </div>
          ) : (
            <div className="adm-info-grid">

              {/* => Cluster - always plain text, never editable, even here */}
              <div className="adm-info-card">
                <p className="adm-info-label">Cluster</p>
                <p className="adm-info-value">{batchRow.cluster ?? '-'}</p>
              </div>

              {/* => One trainer dropdown per course, not per grade level -
                     doubles as the read-only course list too, so the
                     separate cards from before are no longer needed.
                     cluster itself stays locked/uneditable, same as before. */}
              <div className="adm-form-group">
                <label className="adm-form-label">Course Trainers</label>
                {loadingTrainers ? (
                  <p className="adm-empty-note">Loading trainers…</p>
                ) : (
                  ['Grade 11', 'Grade 12'].map(grade => {
                    const coursesForGrade = courseTrainers.filter(c => c.grade_level === grade);
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
                        {coursesForGrade.map(c => (
                          <div key={c.course_id} className="adm-course-trainer-row">
                            <label className="adm-form-label adm-form-label--sub">{c.course_title}</label>
                            <select
                              className="adm-form-select"
                              value={draft.course_trainers?.[c.course_id] ?? ''}
                              onChange={e => setDraft(prev => ({
                                ...prev,
                                course_trainers: { ...prev.course_trainers, [c.course_id]: e.target.value },
                              }))}
                            >
                              <option value="">- Unassigned -</option>
                              {getQualifiedTrainersForCourse(c.course_id).map(t => (
                                <option key={t.trainer_id} value={t.trainer_id}>{t.trainer_full_name}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="adm-form-group">
                <label className="adm-form-label">Start Date</label>
                <input
                  type="date"
                  className="adm-form-input"
                  min={getTomorrowDateString()}
                  value={draft.start_date}
                  onChange={e => updateDraft('start_date', e.target.value)}
                />
              </div>

              <div className="adm-form-group">
                <label className="adm-form-label">End Date</label>
                <input
                  type="date"
                  className="adm-form-input"
                  min={getMinEndDate(draft.start_date)}
                  value={draft.end_date}
                  onChange={e => updateDraft('end_date', e.target.value)}
                />
              </div>

              <div className="adm-form-group">
                <label className="adm-form-label">Required Students <span className="adm-form-required">*</span></label>
                <input
                  type="number"
                  className="adm-form-input"
                  min="1"
                  value={draft.required_number_of_students}
                  onChange={e => updateDraft('required_number_of_students', e.target.value)}
                />
              </div>

              <div className="adm-form-group">
                <label className="adm-form-label">Max Students <span className="adm-form-required">*</span></label>
                <input
                  type="number"
                  className="adm-form-input"
                  min="1"
                  value={draft.max_students}
                  onChange={e => updateDraft('max_students', e.target.value)}
                />
              </div>

              <div className="adm-form-group">
                <label className="adm-form-label">Groupchat Link <span className="adm-form-optional">(optional)</span></label>
                <input
                  type="text"
                  className="adm-form-input"
                  placeholder="https://m.me/..."
                  value={draft.groupchat_link}
                  onChange={e => updateDraft('groupchat_link', e.target.value)}
                />
              </div>

            </div>
          )}
        </div>

        {/* ENROLLED STUDENTS TABLE */}
        <div className="adm-batch-section">
          <p className="adm-section-title">
            Enrolled Students
            <span className="adm-section-count-inline">{enrolledStudents?.length ?? 0}</span>
          </p>

          {!enrolledStudents || enrolledStudents.length === 0 ? (
            <p className="adm-empty-note">No students enrolled in this batch yet.</p>
          ) : (
            <div className="adm-sub-table-wrap">
              <table className="adm-sub-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Email</th>
                    <th>Enrollment Status</th>
                    <th>Submitted</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {enrolledStudents.map((s) => (
                    <tr
                      key={s.enrollment_public_id}
                      className="adm-sub-table-row"
                      onClick={() => navigate(`/dashboard/enrollments/${s.enrollment_public_id}`)}
                      title="View enrollment detail"
                    >
                      <td className="adm-td-student-name">{fullName(s)}</td>
                      <td className="adm-td-email">{s.student_email}</td>
                      <td>
                        <span className={`adm-badge ${enrollmentStatusClass[s.enrollment_status] || ''}`}>
                          {s.enrollment_status}
                        </span>
                      </td>
                      <td className="adm-td-date">
                        {s.submitted_at
                          ? new Date(s.submitted_at).toLocaleDateString('en-PH', {
                              year: 'numeric', month: 'short', day: 'numeric',
                            })
                          : '-'}
                      </td>
                      <td className="adm-td-arrow">›</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* CLASS SESSIONS - every booked session for this batch, across
               all facilities and types */}
        <div className="adm-batch-section">
          <p className="adm-section-title">
            Class Sessions
            <span className="adm-section-count-inline">{classSessions.length}</span>
          </p>

          {classSessionsLoading && <p className="adm-empty-note">Loading sessions…</p>}

          {!classSessionsLoading && classSessions.length === 0 && (
            <p className="adm-empty-note">No sessions scheduled yet.</p>
          )}

          {!classSessionsLoading && classSessions.length > 0 && (
            <div className="adm-sub-table-wrap">
              <table className="adm-sub-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Location / Link</th>
                    <th>Trainer</th>
                  </tr>
                </thead>
                <tbody>
                  {classSessions.map((s) => (
                    <tr
                      key={s.public_id}
                      className="adm-sub-table-row"
                      style={{ cursor: s.session_type === 'Local' && s.facility_public_id ? 'pointer' : 'default' }}
                      onClick={
                        s.session_type === 'Local' && s.facility_public_id
                          ? () => navigate(`/dashboard/classes/sessions/${s.facility_public_id}`)
                          : undefined
                      }
                      title={s.session_type === 'Local' ? 'View facility calendar' : undefined}
                    >
                      <td>{s.session_type}</td>
                      <td className="adm-td-date">{formatDate(s.session_date)}</td>
                      <td>{formatTime(s.start_time)} - {formatTime(s.end_time)}</td>
                      <td>
                        {s.session_type === 'Local'
                          ? (s.facility_name || '-')
                          : s.session_type === 'Mobile'
                          ? (s.mobile_location || '-')
                          : (s.meeting_link || '-')}
                      </td>
                      <td>{s.trainer_name ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ACTIVITY LOGS - audit trail for this batch, newest first.
               System-actor entries (e.g. the automatic Pending -> Ongoing
               promotion) get a distinct badge so they read differently
               from admin-initiated changes at a glance. */}
        <div className="adm-batch-section">
          <p className="adm-section-title">
            Activity Logs
            <span className="adm-section-count-inline">{logs.length}</span>
          </p>

          {logsLoading && <p className="adm-empty-note">Loading logs…</p>}

          {!logsLoading && logs.length === 0 && (
            <p className="adm-empty-note">No activity recorded for this batch yet.</p>
          )}

          {!logsLoading && logs.length > 0 && (
            <div className="adm-sub-table-wrap">
              <table className="adm-sub-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.log_id}>
                      <td className="adm-td-date">
                        {new Date(log.created_at).toLocaleString('en-PH', {
                          year: 'numeric', month: 'short', day: 'numeric',
                          hour: 'numeric', minute: '2-digit',
                        })}
                      </td>
                      <td>
                        {log.actor_type === 'System' ? (
                          <span className="adm-badge" style={{ background: '#ede9fe', color: '#5b21b6' }}>
                            System
                          </span>
                        ) : (
                          log.actor_name
                        )}
                      </td>
                      <td>{log.action}</td>
                      <td className="adm-td-email">{log.action_detail || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* => Concluded status change is gated behind this confirmation -
             the actual PATCH only fires once the admin confirms */}
      <ConfirmModal
        isOpen={showConcludeConfirm}
        message="Have you already consulted the trainer about concluding this batch?"
        onConfirm={handleConfirmConclude}
        onCancel={() => setShowConcludeConfirm(false)}
      />

      {/* => Marking Grade 11 complete removes it from every future class
             session's course picker for this batch - no undo button in
             this UI, so this confirmation is the only guard against a
             misclick */}
      <ConfirmModal
        isOpen={showGrade11CompleteConfirm}
        message="Mark Grade 11 as completed for this batch? Only Grade 12 courses will be selectable for new class sessions afterward."
        onConfirm={runMarkGrade11Complete}
        onCancel={() => setShowGrade11CompleteConfirm(false)}
      />
    </div>
  );
}
