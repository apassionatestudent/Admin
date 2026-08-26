// => admin/components/Classes/TesdaBatchDetail/TesdaBatchDetail.jsx
// => Full detail view for a single TESDA batch
// => Split from the old shared ClassDetail.jsx, following the same
//    tesdaEnrollmentDetail.jsx / shsEnrollmentDetail.jsx split pattern
// => Edit mode follows the exact same SectionEditControls pattern used on
//    tesdaEnrollmentDetail.jsx: one section editable at a time, pencil
//    toggles to Save/Cancel, draft state holds in-progress values.

import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useParams, useNavigate } from 'react-router-dom';
import axiosAdmin from '../../../utils/axiosAdmin.js';
import BackButton from '../../BackButton/BackButton.jsx';
import ConfirmModal from '../../ConfirmModal/ConfirmModal.jsx';
// => Shared spinner/error block, replaces the local adm-batch-detail-state markup below
import LoadingState from '../../LoadingState/loadingState.jsx';
import pencilIcon from '../../../assets/icons/pencil.png';
import trashIcon from '../../../assets/icons/trash.png';
import LogComponent from '../../LogComponent/logComponent.jsx'; // => shared log table, chevron icon lives inside it now
import releaseIcon from '../../../assets/icons/release.png';


import './TesdaBatchDetail.css';

// => Maps status to CSS modifier class
const statusClass = {
  'Pending':   'status--pending',
  'Ongoing':   'status--ongoing',
  'Concluded': 'status--concluded',
  'Dissolved': 'status--dissolved',
};

// => Handles both plain DATE strings ('2026-06-01') and
// => full ISO timestamps ('2026-06-01T00:00:00.000Z') from the pg driver
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

// => Same date-string form the date <input> expects - strips any time
//    component off a stored DATE/TIMESTAMPTZ value
const toDateInputValue = (dateStr) => {
  if (!dateStr) return '';
  return String(dateStr).slice(0, 10);
};

// => TIME columns come back as 'HH:MM:SS' - trims to 'HH:MM' for display
const formatTime = (timeStr) => {
  if (!timeStr) return '-';
  return String(timeStr).slice(0, 5);
};

// => Tomorrow as YYYY-MM-DD - matches the backend's validateBatchDates:
//    a start_date of today or earlier isn't allowed
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

// => Client-side mirror of the backend's date validation - this form isn't
//    a native <form> submission so the date input's min attribute alone
//    never blocks a typed-in bad value on save
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

// => Derives full name from profile fields
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

// => SectionEditControls - pencil / Save / Cancel row shown next to the
//    section title, exact same pattern as tesdaEnrollmentDetail.jsx.
//    isEditing is derived by comparing editingSection to this section's own key.
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

export default function TesdaBatchDetail() {
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
  //    Information + Trainer together, since both save through the same
  //    PATCH /api/admin/batches/tesda/:publicId endpoint anyway. course_id
  //    is never part of the draft - it's permanently locked, shown as
  //    plain text even while the rest of the section is in edit mode.
  const [editingSection, setEditingSection] = useState(null);
  const [draft,          setDraft]          = useState({});
  const [sectionSaving,  setSectionSaving]  = useState(false);
  const [sectionError,   setSectionError]   = useState(null);

  // => Trainer dropdown options - lazy-loaded only once edit mode opens,
  //    same pattern as tesdaEnrollmentDetail.jsx's classOptions fetch
  const [trainerOptions, setTrainerOptions] = useState([]);
  const [trainerTesdaCourses, setTrainerTesdaCourses] = useState([]);
  const [loadingTrainers, setLoadingTrainers] = useState(false);

  useEffect(() => {
    if (editingSection !== 'batchInfo') return;
    setLoadingTrainers(true);
    fetch('/api/admin/batches/form-options', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setTrainerOptions(d.trainers || []);
        setTrainerTesdaCourses(d.trainerTesdaCourses || []);
      })
      .catch(err => console.error('Failed to fetch trainer options:', err))
      .finally(() => setLoadingTrainers(false));
  }, [editingSection]);

  // => Activity log for this batch - status changes, edits, and the
  //    automatic System-driven Ongoing promotion all show up here
  const [logs,        setLogs]        = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);


  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/admin/batches/tesda/${publicId}/logs`, {
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

  // => Column defs handed to LogComponent, matches this page's existing
  //    Date/Actor/Action/Details layout, including the System actor badge
  const logColumns = [
    {
      key: 'date',
      header: 'Date',
      render: (log) => new Date(log.created_at).toLocaleString('en-PH', {
        year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      }),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (log) => log.actor_type === 'System' ? (
        <span className="adm-badge" style={{ background: '#ede9fe', color: '#5b21b6' }}>System</span>
      ) : (
        log.actor_name
      ),
    },
    { key: 'action', header: 'Action', render: (log) => log.action },
    {
      key: 'details',
      header: 'Details',
      cellClassName: 'logc-log-detail-cell',
      render: (log) => log.action_detail || '-',
    },
  ];

  // => Every session booked for this batch, across all facilities and
  //    types (Local/Mobile/Online) - resolved server-side from this page's
  //    batch public_id, no need to wait for fetchDetail to know the
  //    integer batch_id first
  const [classSessions, setClassSessions] = useState([]);
  const [classSessionsLoading, setClassSessionsLoading] = useState(false);

  const fetchClassSessions = async () => {
    setClassSessionsLoading(true);
    try {
      const res = await axiosAdmin.get(`/api/admin/class-sessions/batch/tesda/${publicId}`);
      setClassSessions(res.data.sessions || []);
    } catch (err) {
      console.error('Failed to fetch class sessions:', err);
    } finally {
      setClassSessionsLoading(false);
    }
  };

  // => Miscellaneous fee line items for this batch - own fetch, own
  //    state, same self-contained pattern as fetchClassSessions above
  const [miscFees, setMiscFees] = useState([]);
  const [miscFeesTotal, setMiscFeesTotal] = useState(0);
  const [miscFeesLoading, setMiscFeesLoading] = useState(false);

  const fetchMiscFees = async () => {
    setMiscFeesLoading(true);
    try {
      const res = await axiosAdmin.get(`/api/admin/batches/tesda/${publicId}/misc-fees`);
      setMiscFees(res.data.fees || []);
      setMiscFeesTotal(res.data.totalAmount || 0);
    } catch (err) {
      console.error('Failed to fetch miscellaneous fees:', err);
    } finally {
      setMiscFeesLoading(false);
    }
  };

  // => Add Fee form state
  const [newFeeLabel, setNewFeeLabel] = useState('');
  const [newFeeAmount, setNewFeeAmount] = useState('');
  const [addingFee, setAddingFee] = useState(false);
  const [deletingFeeId, setDeletingFeeId] = useState(null);
  // => Bulk release only fires once the admin confirms via ConfirmModal
  //    below - no per-enrollment state needed, the whole batch's overflow
  //    releases together
  const [bulkReleaseConfirm, setBulkReleaseConfirm] = useState(false);
  const [bulkReleasing, setBulkReleasing] = useState(false);
  // => Holds the fee object pending deletion, or null. Delete only fires
  //    once the admin confirms via ConfirmModal below.
  const [deleteFeeConfirm, setDeleteFeeConfirm] = useState(null);

  const handleAddMiscFee = async () => {
    if (!newFeeLabel.trim()) {
      toast.error('Fee label is required.');
      return;
    }
    const numericAmount = parseFloat(newFeeAmount);
    if (!numericAmount || numericAmount <= 0) {
      toast.error('Enter a valid fee amount.');
      return;
    }
    setAddingFee(true);
    try {
      await axiosAdmin.post(`/api/admin/batches/tesda/${publicId}/misc-fees`, {
        fee_label: newFeeLabel.trim(),
        fee_amount: numericAmount,
      });
      setNewFeeLabel('');
      setNewFeeAmount('');
      toast.success('Fee added.');
      await fetchMiscFees();
      // => Fee creation writes an activity log row on the backend, but this
      //    page never re-fetched logs after a fee save, so the new row
      //    silently never appeared until some other action happened to
      //    trigger fetchLogs()
      await fetchLogs();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add fee.');
    } finally {
      setAddingFee(false);
    }
  };

  const handleDeleteMiscFee = async () => {
    if (!deleteFeeConfirm) return;
    const feePublicId = deleteFeeConfirm.public_id;
    setDeleteFeeConfirm(null);
    setDeletingFeeId(feePublicId);
    try {
      await axiosAdmin.delete(`/api/admin/batches/misc-fees/${feePublicId}`);
      toast.success('Fee removed.');
      await fetchMiscFees();
      await fetchLogs();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove fee.');
    } finally {
      setDeletingFeeId(null);
    }
  };

  // => silent=true skips the full-page loading spinner - used when
  //    re-fetching after a save, where the page is already showing content
  const fetchDetail = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/batches/tesda/${publicId}`, {
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
    fetchMiscFees();
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
    const { batchRow } = data;
    startEdit('batchInfo', {
      trainer_id:                  batchRow.trainer_id ?? '',
      start_date:                  toDateInputValue(batchRow.start_date),
      end_date:                    toDateInputValue(batchRow.end_date),
      required_number_of_students: batchRow.required_number_of_students ?? '',
      max_students:                batchRow.max_students ?? '',
      max_applicants:               batchRow.max_applicants ?? '',
      class_type:                  batchRow.class_type ?? 'Regular',
      groupchat_link:              batchRow.groupchat_link ?? '',
    });
  };

  const handleSaveBatchInfo = async () => {
    setSectionError(null);

    if (!draft.required_number_of_students || !draft.max_students || !draft.max_applicants) {
      setSectionError('Required Students, Max Students, and Max Applicant Pool are all required.');
      return;
    }
    if (Number(draft.required_number_of_students) > Number(draft.max_students)) {
      setSectionError('Required Students cannot exceed Max Students.');
      return;
    }
    if (Number(draft.max_students) > Number(draft.max_applicants)) {
      setSectionError('Max Students cannot exceed Max Applicant Pool.');
      return;
    }
    const dateError = validateDatesClient(draft.start_date, draft.end_date);
    if (dateError) {
      setSectionError(dateError);
      return;
    }

    setSectionSaving(true);
    try {
      await axiosAdmin.patch(`/api/admin/batches/tesda/${publicId}`, {
        trainer_id:                  draft.trainer_id ? Number(draft.trainer_id) : null,
        start_date:                  draft.start_date || null,
        end_date:                    draft.end_date || null,
        required_number_of_students: Number(draft.required_number_of_students),
        max_students:                Number(draft.max_students),
        max_applicants:               Number(draft.max_applicants),
        class_type:                  draft.class_type,
        groupchat_link:              draft.groupchat_link?.trim() || null,
      });

      // => Re-fetch instead of merging the PATCH response - UPDATE...RETURNING
      //    only returns raw columns like trainer_id, not the joined
      //    trainer_name/contact/email, so a merge left the old trainer info
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

  // => Switched from plain fetch to axiosAdmin - fetch was silently
  //    omitting the x-csrf-token header, same latent CSRF bug fixed
  //    earlier in Facility/Instructor restore
  // => Remarks are required on every status change, matching the same
  //    convention Facility/Trainer already follow
  // => Does the actual PATCH - split out so the Concluded confirm gate
  //    below can call this after the admin says Yes, without duplicating
  //    the request logic
  const runStatusSave = async () => {
    setStatusSaving(true);
    try {
      const res = await axiosAdmin.patch(`/api/admin/batches/tesda/${publicId}/status`, {
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

  // => Swapped local adm-batch-detail-state spinner/warning markup for the
  //    shared LoadingState component, same variant pattern used elsewhere
  if (loading) {
    return (
      <div className="adm-tesda-batch-detail-page">
        <LoadingState message="Loading batch details…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="adm-tesda-batch-detail-page">
        <BackButton destination="Classes" onClick={() => navigate('/dashboard/classes')} />
        <LoadingState variant="error" message={error} />
      </div>
    );
  }

  const { batchRow, enrolledStudents } = data;
  // => Slots are consumed only by Approved enrollments now, not by the
  //    full roster - Pending/Reviewed/Reserved students no longer count
  //    against max_students, matching the backend's current_batch_count
  const approvedCount = enrolledStudents?.filter(s => s.enrollment_status === 'Approved').length ?? 0;
  const remainingSlots = batchRow.max_students - approvedCount;
  // => Everyone still waiting once the batch is full - what Release
  //    Overflow would actually release
  const releasableCount = enrolledStudents?.filter(s => ['Pending', 'Reviewed', 'Needs Clarification'].includes(s.enrollment_status)).length ?? 0;
  const isEditingBatchInfo = editingSection === 'batchInfo';

  return (
    <div className="adm-tesda-batch-detail-page">

      <BackButton destination="Classes" onClick={() => navigate('/dashboard/classes')} />

      <div className="adm-batch-detail-body">

        {/* HERO HEADER */}
        <div className="adm-batch-detail-hero">
          <div className="adm-hero-left">
            <p className="adm-hero-sector">TESDA Batch</p>
            <h1 className="adm-hero-course-name">
              {batchRow.course_name ?? '-'}
              {batchRow.certification_type ? ` (${batchRow.certification_type})` : ''}
              {/* => batch_sequence is the per-course display number,
                     batch_id is just the raw primary key and skips gaps
                     left by dissolved batches - same fix as the list view
                     in Classes.jsx */}
              {' '}(Batch #{batchRow.batch_sequence ?? batchRow.batch_id})
            </h1>
          </div>

          <span className={`adm-hero-badge ${statusClass[batchRow.status] || ''}`}>
            {batchRow.status}
          </span>
        </div>

        {/* STATUS CHANGER */}
        <div className="tbd-section">
          <p className="tbd-section-title">Update Status</p>
          <div className="adm-status-changer">
            <select
              className="adm-status-select"
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
            >
              {/* => Disabled once the batch has left Pending at all
                     (Ongoing, Concluded, or Dissolved) - reverting to
                     "not yet started" isn't a real option anymore once any
                     of those has happened. Backend enforces this too either way. */}
              <option value="Pending" disabled={batchRow.status !== 'Pending'}>Pending</option>
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

        {/* BATCH INFO + TRAINER - one editable section, since both save
               through the same PATCH endpoint. Course is always plain
               text, never part of the draft - permanently locked. */}
        <div className="tbd-section">
          <div className="adm-section-header">
            <p className="tbd-section-title">Batch Information</p>
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
            <>
              <div className="adm-info-grid">

                <div className="adm-info-card">
                  <p className="adm-info-label">Course</p>
                  <p className="adm-info-value">
                    {batchRow.course_name ?? '-'}
                    {batchRow.certification_type ? ` (${batchRow.certification_type})` : ''}
                  </p>
                </div>

                {batchRow.hours && (
                  <div className="adm-info-card">
                    <p className="adm-info-label">Duration</p>
                    <p className="adm-info-value">{batchRow.hours} hours</p>
                  </div>
                )}

                <div className="adm-info-card">
                  <p className="adm-info-label">Sector</p>
                  <p className="adm-info-value">{batchRow.sector ?? '-'}</p>
                </div>

                <div className="adm-info-card">
                  <p className="adm-info-label">Batch Type</p>
                  <p className="adm-info-value">{batchRow.class_type ?? '-'}</p>
                </div>

                {/* => Only shown for Regular batches - TESDA-Sponsored is
                       paid by TESDA, not the enrollee, so a fee isn't
                       relevant to show there */}
                {batchRow.class_type === 'Regular' && (
                  <div className="adm-info-card">
                    <p className="adm-info-label">Amount</p>
                    <p className="adm-info-value">
                      {batchRow.amount != null
                        ? `₱${Number(batchRow.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                        : '-'}
                    </p>
                  </div>
                )}

                <div className="adm-info-card">
                  <p className="adm-info-label">Trainer</p>
                  <p className="adm-info-value">{batchRow.trainer_name ?? '-'}</p>
                </div>

                {batchRow.trainer_contact && (
                  <div className="adm-info-card">
                    <p className="adm-info-label">Trainer Contact</p>
                    <p className="adm-info-value">{batchRow.trainer_contact}</p>
                  </div>
                )}

                {batchRow.trainer_email && (
                  <div className="adm-info-card">
                    <p className="adm-info-label">Trainer Email</p>
                    <p className="adm-info-value">{batchRow.trainer_email}</p>
                  </div>
                )}

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
                  <p className="adm-info-label">Max Applicant Pool</p>
                  <p className="adm-info-value">{batchRow.max_applicants ?? '-'}</p>
                </div>

                <div className="adm-info-card">
                  <p className="adm-info-label">Enrolled</p>
                  <p className="adm-info-value">
                    {enrolledStudents?.length ?? 0}
                    {' '}
                    {/* => Note now clarifies that remaining slots track Approved
                           count specifically, not the total roster shown above */}
                    <span className="adm-slots-note">
                      ({approvedCount} approved &middot; {remainingSlots > 0 ? `${remainingSlots} slot${remainingSlots !== 1 ? 's' : ''} remaining` : 'Full'})
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
            </>
          ) : (
            <div className="adm-info-grid">

              {/* => Course - always plain text, never editable, even here */}
              <div className="adm-info-card">
                <p className="adm-info-label">Course</p>
                <p className="adm-info-value">
                  {batchRow.course_name ?? '-'}
                  {batchRow.certification_type ? ` (${batchRow.certification_type})` : ''}
                </p>
              </div>

              <div className="adm-form-group">
                <label className="adm-form-label">Trainer</label>
                {loadingTrainers ? (
                  <p className="tbd-empty-note">Loading trainers…</p>
                ) : (
                  <select
                    className="adm-form-select"
                    value={draft.trainer_id}
                    onChange={e => updateDraft('trainer_id', e.target.value)}
                  >
                    <option value="">- Unassigned -</option>
                    {trainerOptions
                      .filter(t => t.handles_tesda && trainerTesdaCourses.some(
                        tc => tc.trainer_id === t.trainer_id && tc.course_id === batchRow.course_id
                      ))
                      .map(t => (
                      <option key={t.trainer_id} value={t.trainer_id}>{t.trainer_full_name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="adm-form-group">
                <label className="adm-form-label">Batch Type</label>
                <select
                  className="adm-form-select"
                  value={draft.class_type}
                  onChange={e => updateDraft('class_type', e.target.value)}
                >
                  <option value="Regular">Regular</option>
                  <option value="TESDA-Sponsored">TESDA-Sponsored</option>
                </select>
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
                <label className="adm-form-label">Max Applicant Pool <span className="adm-form-required">*</span></label>
                <input
                  type="number"
                  className="adm-form-input"
                  min="1"
                  value={draft.max_applicants}
                  onChange={e => updateDraft('max_applicants', e.target.value)}
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

        {/* MISCELLANEOUS FEES */}
        <div className="tbd-section">
          <p className="tbd-section-title">
            Miscellaneous Fees
            <span className="tbd-section-count-inline">{miscFees.length}</span>
          </p>

          {miscFeesLoading && <p className="tbd-empty-note">Loading fees…</p>}

          {!miscFeesLoading && miscFees.length === 0 && (
            <p className="tbd-empty-note">No miscellaneous fees added yet.</p>
          )}

          {!miscFeesLoading && miscFees.length > 0 && (
            <div className="tbd-sub-table-wrap">
              <table className="tbd-sub-table">
                <thead>
                  <tr>
                    <th>Fee</th>
                    <th>Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {miscFees.map((fee) => (
                    <tr key={fee.public_id}>
                      <td className="adm-td-student-name">{fee.fee_label}</td>
                      <td>₱{Number(fee.fee_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      <td className="adm-td-arrow">
                        <button
                          className="adm-fee-delete-btn"
                          onClick={() => setDeleteFeeConfirm(fee)}
                          disabled={deletingFeeId === fee.public_id}
                          title="Remove fee"
                        >
                          <img src={trashIcon} alt="Remove" className="adm-pencil-icon" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!miscFeesLoading && miscFees.length > 0 && (
            <p className="adm-fee-total">
              Total: ₱{Number(miscFeesTotal).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </p>
          )}

          <div className="adm-fee-add-row">
            <input
              type="text"
              className="adm-form-input"
              placeholder="Fee label (e.g. ID Fee)"
              value={newFeeLabel}
              onChange={e => setNewFeeLabel(e.target.value)}
            />
            <input
              type="number"
              step="0.01"
              min="0"
              className="adm-form-input"
              placeholder="Amount"
              value={newFeeAmount}
              onChange={e => setNewFeeAmount(e.target.value)}
            />
            <button className="adm-status-btn" onClick={handleAddMiscFee} disabled={addingFee}>
              {addingFee ? 'Adding…' : 'Add Fee'}
            </button>
          </div>
        </div>

        {/* ENROLLED STUDENTS TABLE */}
        <div className="tbd-section">
          <div className="adm-section-header">
            <p className="tbd-section-title">
              Enrolled Students
              <span className="tbd-section-count-inline">{enrolledStudents?.length ?? 0}</span>
            </p>
            {/* => Only shows once the batch has actually reached max_students
                   on Approved count, and only if there's overflow left to
                   release - a full batch with nobody else waiting shows
                   nothing here */}
            {approvedCount >= batchRow.max_students && releasableCount > 0 && (
              
              <button className="adm-release-btn" onClick={() => setBulkReleaseConfirm(true)}>
                <img src={releaseIcon} alt="" className="adm-release-icon" />
                Release Overflow ({releasableCount})
              </button>
            )}
          </div>

          {!enrolledStudents || enrolledStudents.length === 0 ? (
            <p className="tbd-empty-note">No students enrolled in this batch yet.</p>
          ) : (
            <div className="tbd-sub-table-wrap">
              <table className="tbd-sub-table">
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
                      className="tbd-sub-table-row"
                      // => Route must match App.jsx: /dashboard/enrollments/tesda/:publicId -
                      //    hardcoded 'tesda' since this page only ever lists TESDA enrollments
                      onClick={() => navigate(`/dashboard/enrollments/tesda/${s.enrollment_public_id}`)}
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
        <div className="tbd-section">
          <p className="tbd-section-title">
            Class Sessions
            <span className="tbd-section-count-inline">{classSessions.length}</span>
          </p>

          {classSessionsLoading && <p className="tbd-empty-note">Loading sessions…</p>}

          {!classSessionsLoading && classSessions.length === 0 && (
            <p className="tbd-empty-note">No sessions scheduled yet.</p>
          )}

          {!classSessionsLoading && classSessions.length > 0 && (
            <div className="tbd-sub-table-wrap">
              <table className="tbd-sub-table">
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
                      className="tbd-sub-table-row"
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
        <div className="tbd-section">
          <p className="tbd-section-title">
            Activity Logs
            <span className="tbd-section-count-inline">{logs.length}</span>
          </p>

          <LogComponent
            logs={logs}
            columns={logColumns}
            loading={logsLoading}
            page={1}
            totalPages={1}
            onPageChange={() => {}}
            emptyMessage="No activity recorded for this batch yet."
            renderDetail={(log) => <p>{log.action_detail || '-'}</p>}
          />
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

      {/* => Fee deletion is destructive and does NOT touch any payment
             already recorded against it - the warning says so explicitly */}
      <ConfirmModal
        isOpen={!!deleteFeeConfirm}
        message={`Remove "${deleteFeeConfirm?.fee_label}"? This can't be undone. If a student already paid toward this fee, that payment stays on record as-is - it will not be refunded automatically. Issue a Refund separately if one is owed.`}
        onConfirm={handleDeleteMiscFee}
        onCancel={() => setDeleteFeeConfirm(null)}
      />

      {/* => Bulk-releases every remaining Pending/Reviewed/Needs
             Clarification enrollment in this batch back to Reserved in
             one go, once the batch has actually reached max_students */}
      <ConfirmModal
        isOpen={bulkReleaseConfirm}
        message={`This batch has reached its maximum capacity (${approvedCount}/${batchRow.max_students} approved). Release the remaining ${releasableCount} student${releasableCount !== 1 ? 's' : ''} still waiting back to Reserved? They will be unassigned from this batch, but their submitted information stays intact for placement into a future batch.`}
        onConfirm={async () => {
          setBulkReleasing(true);
          try {
            const res = await axiosAdmin.patch(`/api/admin/batches/tesda/${publicId}/bulk-release`);
            await fetchDetail(true);
            await fetchLogs();
            toast.success(`${res.data.releasedCount} enrollment(s) released back to Reserved.`);
          } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to release enrollments.');
          } finally {
            setBulkReleasing(false);
            setBulkReleaseConfirm(false);
          }
        }}
        onCancel={() => { if (!bulkReleasing) setBulkReleaseConfirm(false); }}
      />
    </div>
  );
}
