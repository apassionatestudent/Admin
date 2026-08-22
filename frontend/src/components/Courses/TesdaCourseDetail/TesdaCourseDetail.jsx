import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useParams, useNavigate } from 'react-router-dom'; 
import axiosAdmin from '../../../utils/axiosAdmin.js'; 
import pencilIcon from '../../../assets/icons/pencil.png'; 
import trashIcon from '../../../assets/icons/trash.png'; 
import BackButton from '../../BackButton/BackButton.jsx'; 
import ConfirmModal from '../../ConfirmModal/ConfirmModal.jsx';
// => Shared spinner/error block, replaces the local detail-loading-state markup below
import LoadingState from '../../LoadingState/loadingState.jsx';
// => Shared log table + pagination component, chevron icon lives inside it now
import LogComponent from '../../LogComponent/logComponent.jsx';

import './TesdaCourseDetail.css';

// => Title must not contain the NC level itself - mirrors the check in
// => CreateTesdaCourseModal.jsx and the server-side one in tesdaCourseService.js
const NC_LEVEL_PATTERN = /\bNC\s?I{1,3}V?\b/i;

// => Auto Title Cases Title and Job Title fields as the admin edits them -
// => same helper as the Create modal, duplicated per your policy. Cursor
// => position is restored via requestAnimationFrame since naive setState on
// => every keystroke would otherwise jump it to the end of the input.
const toTitleCase = (text) => text.replace(/(^|\s)([a-z])/g, (_, sep, char) => sep + char.toUpperCase());

const applyTitleCase = (e, setValue) => {
  const input = e.target;
  const cursorPos = input.selectionStart;
  const formatted = toTitleCase(input.value);
  setValue(formatted);
  requestAnimationFrame(() => {
    input.setSelectionRange(cursorPos, cursorPos);
  });
};

// => Competency codes must be uppercase with no spaces (e.g. "500311105",
// => "ELC315202"), same helper as CreateTesdaCourseModal.jsx. Stripping
// => spaces changes the string length, so unlike applyTitleCase this counts
// => how many characters were removed before the cursor and adjusts the
// => restored position accordingly.
const formatCode = (text) => text.replace(/\s+/g, '').toUpperCase();

const applyCodeFormat = (e, setValue) => {
  const input = e.target;
  const cursorPos = input.selectionStart;
  const before = input.value;
  const removedBeforeCursor = before.slice(0, cursorPos).length - formatCode(before.slice(0, cursorPos)).length;
  const newCursorPos = cursorPos - removedBeforeCursor;
  setValue(formatCode(before));
  requestAnimationFrame(() => {
    input.setSelectionRange(newCursorPos, newCursorPos);
  });
};

// => Live per-field validators - same shape as CreateTesdaCourseModal.jsx's
const validators = {
  title: (val) => {
    if (!val.trim()) return 'Title is required.';
    if (NC_LEVEL_PATTERN.test(val)) return 'Should not include the NC level (e.g. "NCII") - use the dropdown instead.';
    return '';
  },
  certification_id: (val) => (!val ? 'National Certification Level is required.' : ''),
  description: (val) => (!val.trim() ? 'Description is required.' : ''),
  accreditation_no: (val) => (!val.trim() ? 'Accreditation No. is required.' : ''),
  sector_id: (val) => (!val ? 'Sector is required.' : ''),
  date_accredited: (val) => (!val ? 'Date Accredited is required.' : ''),
  expiration_date: (val, form) => {
    if (!val) return 'Expiration Date is required.';
    if (form.date_accredited && val < form.date_accredited) return 'Cannot be earlier than Date Accredited.';
    return '';
  },
  amount: (val) => {
    if (val === '') return 'Fee is required.';
    if (Number(val) < 0) return 'Fee cannot be negative.';
    return '';
  },
  hours: (val) => {
    if (val === '') return 'Training Hours is required.';
    if (Number(val) < 1) return 'Training Hours must be at least 1.';
    return '';
  },
};

// => Small inline component so every field's error renders the same way
const FieldError = ({ message }) => (message ? <span className="field-error">{message}</span> : null);

export default function TesdaCourseDetail() {
  const { adminUuid } = useParams();
  const navigate = useNavigate();

  const [course, setCourse] = useState(null);
  const [sectors, setSectors] = useState([]);
  const [certificationTypes, setCertificationTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({});
  const [infoFieldErrors, setInfoFieldErrors] = useState({});
  const [infoErrorMsg, setInfoErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  // => Synchronous guard against double-submit. React state (isSaving) only
  // => blocks the button AFTER a re-render, so a fast double-click can still
  // => slip a second request through in that gap. A ref updates instantly.
  const isSavingRef = useRef(false);

  // => One shared ConfirmModal instance for every delete action on this page
  // => (course, competency rows, job opportunity rows) - openConfirm stores
  // => the message plus what to actually run if the admin clicks Yes
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null });
  const openConfirm = (message, onConfirm) => setConfirmModal({ isOpen: true, message, onConfirm });
  const closeConfirm = () => setConfirmModal({ isOpen: false, message: '', onConfirm: null });
  const handleConfirmYes = () => {
    const action = confirmModal.onConfirm;
    closeConfirm();
    if (action) action();
  };

  // => Activity Logs - fetch-all-at-once, no pagination, matches the
  // => Facilities/Trainers/Support Tickets/Batches pattern
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  // => Row-expand state used to live here (expandedLogId) - it now lives
  //    inside LogComponent itself since it's pure UI state with no data
  //    dependency, no parent page needs to read or reset it.

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await axiosAdmin.get(`/api/admin/tesda-courses/${adminUuid}/logs`);
      setLogs(res.data.data || []);
    } catch (error) {
      console.error('Failed to fetch course logs:', error);
    } finally {
      setLogsLoading(false);
    }
  };

  // => Column defs handed to LogComponent, same Date/Actor/Action/Details
  //    layout used on Students/Facilities/Trainers/Support Tickets
  const logColumns = [
    {
      key: 'date',
      header: 'Date',
      render: (log) => new Date(log.created_at).toLocaleString('en-PH', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
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

  useEffect(() => {
    fetchCourse();
    fetchLogs();
    axiosAdmin
      .get('/api/admin/sectors')
      .then((res) => setSectors(res.data.data))
      .catch((err) => console.error('Failed to load sectors:', err));
    axiosAdmin
      .get('/api/admin/tesda-courses/certification-types')
      .then((res) => setCertificationTypes(res.data.data))
      .catch((err) => console.error('Failed to load certification types:', err));
  }, [adminUuid]);

  const fetchCourse = async () => {
    setLoading(true);
    try {
      const res = await axiosAdmin.get(`/api/admin/tesda-courses/${adminUuid}`);
      const data = res.data.data;
      setCourse(data);
      setInfoForm({
        title: data.title,
        description: data.description || '',
        accreditation_no: data.accreditation_no,
        date_accredited: data.date_accredited?.slice(0, 10) || '',
        expiration_date: data.expiration_date?.slice(0, 10) || '',
        sector_id: data.sector_id || '',
        certification_id: data.certification_id || '',
        amount: data.amount,
        hours: data.hours,
      });
    } catch (error) {
      console.error('Failed to load course:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInfoChange = (e) => {
    const { name, value } = e.target;
    const updatedForm = { ...infoForm, [name]: value };
    setInfoForm(updatedForm);

    const validator = validators[name];
    if (validator) {
      setInfoFieldErrors((prev) => ({ ...prev, [name]: validator(value, updatedForm) }));
    }

    // => Expiration Date's validity depends on Date Accredited, so re-check
    // => it too whenever Date Accredited itself changes
    if (name === 'date_accredited' && updatedForm.expiration_date) {
      setInfoFieldErrors((prev) => ({
        ...prev,
        expiration_date: validators.expiration_date(updatedForm.expiration_date, updatedForm),
      }));
    }
  };

  const handleTitleChange = (e) => {
    applyTitleCase(e, (val) => {
      const updatedForm = { ...infoForm, title: val };
      setInfoForm(updatedForm);
      setInfoFieldErrors((prev) => ({ ...prev, title: validators.title(val) }));
    });
  };

  // => Live onChange validation only catches fields the admin actually types
  // => into - a field that was already invalid before edit mode opened (e.g.
  // => a description that was left blank when the course was first created)
  // => would otherwise show no error until touched or until Save is clicked.
  // => Running the full validator sweep the moment Edit is opened surfaces
  // => pre-existing gaps immediately instead.
  const handleStartEditingInfo = () => {
    const initialErrors = {};
    for (const key of Object.keys(validators)) {
      initialErrors[key] = validators[key](infoForm[key], infoForm);
    }
    setInfoFieldErrors(initialErrors);
    setIsEditingInfo(true);
  };

  const handleSaveInfo = async () => {
    // => Bail immediately if a save is already in flight - blocks double
    // => clicks synchronously, before React even gets a chance to re-render
    // => the disabled button
    if (isSavingRef.current) return;

    setInfoErrorMsg('');

    // => Final safety net on Save - re-runs every field's live validator in
    // => case any field was never touched (so its live check never fired)
    const newFieldErrors = {};
    let hasError = false;
    for (const key of Object.keys(validators)) {
      const message = validators[key](infoForm[key], infoForm);
      newFieldErrors[key] = message;
      if (message) hasError = true;
    }
    setInfoFieldErrors(newFieldErrors);

    if (hasError) {
      setInfoErrorMsg('Please fix the highlighted fields before saving.');
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const res = await axiosAdmin.patch(`/api/admin/tesda-courses/${adminUuid}`, infoForm);
      const updated = res.data.data;

      // => updateTesdaCourse's RETURNING * only returns tesda_courses' own
      // => columns - sector_name and certification_type are joined display
      // => fields that only come back from the SELECT-with-JOIN queries, not
      // => a plain UPDATE. Resolving them from the sectors/certificationTypes
      // => lists already sitting in state avoids a network round-trip while
      // => keeping the displayed labels accurate.
      const matchedSector = sectors.find((s) => s.sector_id === updated.sector_id);
      const matchedCert = certificationTypes.find((c) => c.certification_id === updated.certification_id);

      setCourse((prev) => ({
        ...prev,
        ...updated,
        sector_name: matchedSector ? matchedSector.sector : prev.sector_name,
        certification_type: matchedCert ? matchedCert.certification_type : prev.certification_type,
      }));
      setIsEditingInfo(false);
      // => Refresh the Activity Log so the new UPDATE entry appears without a page reload
      await fetchLogs();
    } catch (error) {
      console.error('Failed to update course:', error);
      setInfoErrorMsg(error.response?.data?.message || 'Failed to update course.');
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
  };

  const handleToggleStatus = async () => {
    const newStatus = course.status === 'active' ? 'inactive' : 'active';
    openConfirm(`Change status to ${newStatus}? This can be changed later.`, async () => { 
      try {
        const res = await axiosAdmin.patch(`/api/admin/tesda-courses/${adminUuid}`, { status: newStatus });
        setCourse((prev) => ({ ...prev, status: res.data.data.status }));
        // => Refresh the Activity Log so the new STATUS_CHANGE entry appears without a page reload
        await fetchLogs();
      } catch (error) {
        console.error('Failed to toggle status:', error);
        // => Surfaces the backend's reactivation-guard message (e.g. sector
        // => deleted) instead of failing silently
        toast.error(error.response?.data?.message || 'Failed to change status.');
      }
    });
  };

  const handleDeleteCourse = () => {
    openConfirm('Delete this course? This will be archived..', async () => {
      try {
        await axiosAdmin.delete(`/api/admin/tesda-courses/${adminUuid}`);
        navigate('/dashboard/courses');
      } catch (error) {
        console.error('Failed to delete course:', error);
      }
    });
  };

  // => Add-row state, keyed by competency type so all 3 tables can each have
  // => their own in-progress "add new row" form open independently
  const [newRowByType, setNewRowByType] = useState({ basic: null, common: null, core: null });
  const [editingRow, setEditingRow] = useState(null); // => { type, id }
  const [editRowForm, setEditRowForm] = useState({ code: '', competency: '' });
  const [editRowErrors, setEditRowErrors] = useState({ code: '', competency: '' });
  const [newRowErrors, setNewRowErrors] = useState({ basic: null, common: null, core: null });

  const startAddRow = (type) => {
    setNewRowByType({ ...newRowByType, [type]: { code: '', competency: '' } });
    setNewRowErrors({ ...newRowErrors, [type]: { code: '', competency: '' } });
  };
  const cancelAddRow = (type) => {
    setNewRowByType({ ...newRowByType, [type]: null });
    setNewRowErrors({ ...newRowErrors, [type]: null });
  };

  const handleNewRowChange = (type, field, value) => {
    setNewRowByType({ ...newRowByType, [type]: { ...newRowByType[type], [field]: value } });
    setNewRowErrors({
      ...newRowErrors,
      [type]: {
        ...newRowErrors[type],
        [field]: value.trim() ? '' : `${field === 'code' ? 'Code' : 'Description'} is required.`,
      },
    });
  };

  const submitNewRow = async (type) => {
    const row = newRowByType[type];
    if (!row.code || !row.competency) {
      setNewRowErrors({
        ...newRowErrors,
        [type]: {
          code: row.code ? '' : 'Code is required.',
          competency: row.competency ? '' : 'Description is required.',
        },
      });
      return;
    }
    try {
      const res = await axiosAdmin.post(`/api/admin/tesda-courses/${adminUuid}/competencies`, {
        type,
        code: row.code,
        competency: row.competency,
      });
      const newRow = res.data.data;
      setCourse((prev) => ({
        ...prev,
        competencies: {
          ...prev.competencies,
          [type]: [...prev.competencies[type], newRow],
        },
      }));
      cancelAddRow(type);
      await fetchLogs();
    } catch (error) {
      console.error('Failed to add competency:', error);
    }
  };

  const startEditRow = (type, row) => {
    setEditingRow({ type, id: row.id });
    setEditRowForm({ code: row.code, competency: row.competency });
    setEditRowErrors({ code: '', competency: '' });
  };

  const cancelEditRow = () => setEditingRow(null);

  const handleEditRowChange = (field, value) => {
    setEditRowForm({ ...editRowForm, [field]: value });
    setEditRowErrors({
      ...editRowErrors,
      [field]: value.trim() ? '' : `${field === 'code' ? 'Code' : 'Description'} is required.`,
    });
  };

  const submitEditRow = async () => {
    if (!editRowForm.code || !editRowForm.competency) {
      setEditRowErrors({
        code: editRowForm.code ? '' : 'Code is required.',
        competency: editRowForm.competency ? '' : 'Description is required.',
      });
      return;
    }
    try {
      const res = await axiosAdmin.patch(
        `/api/admin/tesda-courses/competencies/${editingRow.type}/${editingRow.id}`,
        editRowForm
      );
      const updatedRow = res.data.data;
      const { type } = editingRow;
      setCourse((prev) => ({
        ...prev,
        competencies: {
          ...prev.competencies,
          [type]: prev.competencies[type].map((r) => (r.id === updatedRow.id ? updatedRow : r)),
        },
      }));
      setEditingRow(null);
      await fetchLogs();
    } catch (error) {
      console.error('Failed to update competency:', error);
    }
  };

  const handleDeleteRow = (type, id) => {
    openConfirm('Delete this competency row?', async () => {
      try {
        await axiosAdmin.delete(`/api/admin/tesda-courses/competencies/${type}/${id}`);
        setCourse((prev) => ({
          ...prev,
          competencies: {
            ...prev.competencies,
            [type]: prev.competencies[type].filter((r) => r.id !== id),
          },
        }));
        await fetchLogs();
      } catch (error) {
        console.error('Failed to delete competency:', error);
      }
    });
  };

  // => Job opportunities - same add/edit/delete-row pattern as competencies,
  // => just a single field instead of code+description
  const [newJobRow, setNewJobRow] = useState(null);
  const [newJobError, setNewJobError] = useState('');
  const [editingJobId, setEditingJobId] = useState(null);
  const [editJobTitle, setEditJobTitle] = useState('');
  const [editJobError, setEditJobError] = useState('');

  // => Requirements - same add/edit/delete-row pattern as job opportunities,
  // => but with an extra is_required checkbox per row
  const [newRequirementRow, setNewRequirementRow] = useState(null);
  const [newRequirementError, setNewRequirementError] = useState('');
  const [editingRequirementId, setEditingRequirementId] = useState(null);
  const [editRequirementForm, setEditRequirementForm] = useState({ document_type: '', is_required: true, max_files: 1 });
  const [editRequirementError, setEditRequirementError] = useState('');

  const startAddRequirementRow = () => {
    setNewRequirementRow({ document_type: '', is_required: true, max_files: 1 });
    setNewRequirementError('');
  };
  const cancelAddRequirementRow = () => setNewRequirementRow(null);

  const handleNewRequirementChange = (e) => {
    const val = e.target.value;
    setNewRequirementRow({ ...newRequirementRow, document_type: val });
    setNewRequirementError(val.trim() ? '' : 'Requirement label is required.');
  };

  const handleNewRequirementToggle = (e) => {
    setNewRequirementRow({ ...newRequirementRow, is_required: e.target.checked });
  };

  // => Clamped to a minimum of 1 right in the handler - a student can never
  // => be shown an upload field that accepts zero files
  const handleNewRequirementMaxFilesChange = (e) => {
    const val = Math.max(1, Number(e.target.value) || 1);
    setNewRequirementRow({ ...newRequirementRow, max_files: val });
  };

  const submitNewRequirementRow = async () => {
    if (!newRequirementRow.document_type.trim()) {
      setNewRequirementError('Requirement label is required.');
      return;
    }
    try {
      const res = await axiosAdmin.post(`/api/admin/tesda-courses/${adminUuid}/requirements`, {
        document_type: newRequirementRow.document_type,
        is_required: newRequirementRow.is_required,
        max_files: newRequirementRow.max_files,
      });
      const newRequirement = res.data.data;
      setCourse((prev) => ({
        ...prev,
        requirements: [...(prev.requirements ?? []), newRequirement],
      }));
      cancelAddRequirementRow();
      await fetchLogs();
      toast.success('Requirement added.'); // => confirms the row actually saved, matches the job-title/competency Save flow that had no feedback either
    } catch (error) {
      console.error('Failed to add requirement:', error);
      toast.error(error.response?.data?.message || 'Failed to add requirement.');
    }
  };

  const startEditRequirementRow = (row) => {
    setEditingRequirementId(row.id);
    setEditRequirementForm({ document_type: row.document_type, is_required: row.is_required, max_files: row.max_files });
    setEditRequirementError('');
  };

  const cancelEditRequirementRow = () => setEditingRequirementId(null);

  const handleEditRequirementChange = (e) => {
    const val = e.target.value;
    setEditRequirementForm({ ...editRequirementForm, document_type: val });
    setEditRequirementError(val.trim() ? '' : 'Requirement label is required.');
  };

  const handleEditRequirementToggle = (e) => {
    setEditRequirementForm({ ...editRequirementForm, is_required: e.target.checked });
  };

  const handleEditRequirementMaxFilesChange = (e) => {
    const val = Math.max(1, Number(e.target.value) || 1);
    setEditRequirementForm({ ...editRequirementForm, max_files: val });
  };

  const submitEditRequirementRow = async () => {
    if (!editRequirementForm.document_type.trim()) {
      setEditRequirementError('Requirement label is required.');
      return;
    }
    try {
      const res = await axiosAdmin.patch(
        `/api/admin/tesda-courses/requirements/${editingRequirementId}`,
        editRequirementForm
      );
      const updatedRequirement = res.data.data;
      setCourse((prev) => ({
        ...prev,
        requirements: (prev.requirements ?? []).map((r) =>
          r.id === updatedRequirement.id ? updatedRequirement : r
        ),
      }));
      setEditingRequirementId(null);
      await fetchLogs();
    } catch (error) {
      console.error('Failed to update requirement:', error);
    }
  };

  const handleDeleteRequirementRow = (id) => {
    openConfirm('Delete this requirement?', async () => {
      try {
        await axiosAdmin.delete(`/api/admin/tesda-courses/requirements/${id}`);
        setCourse((prev) => ({
          ...prev,
          requirements: (prev.requirements ?? []).filter((r) => r.id !== id),
        }));
        await fetchLogs();
      } catch (error) {
        console.error('Failed to delete requirement:', error);
      }
    });
  };

  const startAddJobRow = () => {
    setNewJobRow({ job_title: '' });
    setNewJobError('');
  };
  const cancelAddJobRow = () => setNewJobRow(null);

  const handleNewJobChange = (e) => {
    applyTitleCase(e, (val) => {
      setNewJobRow({ job_title: val });
      setNewJobError(val.trim() ? '' : 'Job title is required.');
    });
  };

  const submitNewJobRow = async () => {
    if (!newJobRow.job_title) {
      setNewJobError('Job title is required.');
      return;
    }
    try {
      const res = await axiosAdmin.post(`/api/admin/tesda-courses/${adminUuid}/job-opportunities`, {
        job_title: newJobRow.job_title,
      });
      const newJob = res.data.data;
      setCourse((prev) => ({
        ...prev,
        jobOpportunities: [...(prev.jobOpportunities ?? []), newJob],
      }));
      cancelAddJobRow();
      await fetchLogs();
    } catch (error) {
      console.error('Failed to add job opportunity:', error);
    }
  };

  const startEditJobRow = (row) => {
    setEditingJobId(row.id);
    setEditJobTitle(row.job_title);
    setEditJobError('');
  };

  const cancelEditJobRow = () => setEditingJobId(null);

  const handleEditJobChange = (e) => {
    applyTitleCase(e, (val) => {
      setEditJobTitle(val);
      setEditJobError(val.trim() ? '' : 'Job title is required.');
    });
  };

  const submitEditJobRow = async () => {
    if (!editJobTitle) {
      setEditJobError('Job title is required.');
      return;
    }
    try {
      const res = await axiosAdmin.patch(`/api/admin/tesda-courses/job-opportunities/${editingJobId}`, {
        job_title: editJobTitle,
      });
      const updatedJob = res.data.data;
      setCourse((prev) => ({
        ...prev,
        jobOpportunities: (prev.jobOpportunities ?? []).map((j) => (j.id === updatedJob.id ? updatedJob : j)),
      }));
      setEditingJobId(null);
      await fetchLogs();
    } catch (error) {
      console.error('Failed to update job opportunity:', error);
    }
  };

  const handleDeleteJobRow = (id) => {
    openConfirm('Delete this job opportunity?', async () => {
      try {
        await axiosAdmin.delete(`/api/admin/tesda-courses/job-opportunities/${id}`);
        setCourse((prev) => ({
          ...prev,
          jobOpportunities: (prev.jobOpportunities ?? []).filter((j) => j.id !== id),
        }));
        await fetchLogs();
      } catch (error) {
        console.error('Failed to delete job opportunity:', error);
      }
    });
  };

  // => Publish/public-link feature removed - status alone now governs
  // => course visibility, the separate publish gate was redundant with what
  // => the public site actually checks

  // => Renders one competency type's rows as <tr> elements - they get placed
  // => inside ONE shared <table> across all three types (see call site
  // => below), so the browser's normal table auto-layout computes a single
  // => "Code" column width across Basic + Common + Core combined, same as
  // => Job Opportunities' table. Real border-collapse handles continuous row
  // => lines natively - no CSS Grid column-gap/justify-self edge cases to
  // => fight, which is what kept breaking with the Grid-based version.
  const renderCompetencySection = (type, label, rows) => (
    <React.Fragment key={type}>
      <tr className="section-header-row">
        <td colSpan={3}>
          <div className="competency-block-header">
            <h4>{label}</h4>
            <button className="btn-add-row" onClick={() => startAddRow(type)}>
              + Add Row
            </button>
          </div>
        </td>
      </tr>
      <tr>
        <th className="col-code">Code</th>
        <th>Description</th>
        <th></th>
      </tr>

      {rows.map((row) =>
        editingRow?.type === type && editingRow?.id === row.id ? (
          <tr key={row.id}>
            <td className="col-code">
              <input
                value={editRowForm.code}
                onChange={(e) => applyCodeFormat(e, (val) => handleEditRowChange('code', val))}
                required
              />
              <FieldError message={editRowErrors.code} />
            </td>
            <td>
              <input
                value={editRowForm.competency}
                onChange={(e) => handleEditRowChange('competency', e.target.value)}
                required
              />
              <FieldError message={editRowErrors.competency} />
            </td>
            <td className="row-actions">
              <button onClick={submitEditRow}>Save</button>
              <button onClick={cancelEditRow}>Cancel</button>
            </td>
          </tr>
        ) : (
          <tr key={row.id}>
            <td className="col-code">{row.code}</td>
            <td>{row.competency}</td>
            <td className="row-actions">
              <button className="icon-btn" onClick={() => startEditRow(type, row)} title="Edit">
                <img src={pencilIcon} alt="Edit" className="pencil-icon" />
              </button>
              <button className="icon-btn" onClick={() => handleDeleteRow(type, row.id)} title="Delete">
                <img src={trashIcon} alt="Delete" className="trash-icon" />
              </button>
            </td>
          </tr>
        )
      )}

      {newRowByType[type] && (
        <tr>
          <td className="col-code">
            <input
              value={newRowByType[type].code}
              onChange={(e) => applyCodeFormat(e, (val) => handleNewRowChange(type, 'code', val))}
              required
            />
            <FieldError message={newRowErrors[type]?.code} />
          </td>
          <td>
            <input
              value={newRowByType[type].competency}
              onChange={(e) => handleNewRowChange(type, 'competency', e.target.value)}
              required
            />
            <FieldError message={newRowErrors[type]?.competency} />
          </td>
          <td className="row-actions">
            <button onClick={() => submitNewRow(type)}>Save</button>
            <button onClick={() => cancelAddRow(type)}>Cancel</button>
          </td>
        </tr>
      )}

      {rows.length === 0 && !newRowByType[type] && (
        <tr>
          <td colSpan="3" className="competency-empty">
            No {label.toLowerCase()} yet.
          </td>
        </tr>
      )}
    </React.Fragment>
  );

  // => Swapped local detail-loading-state spinner markup, and the bare
  //    "Course not found." <p>, for the shared LoadingState component
  if (loading) {
    return (
      <main className="course-detail-page">
        <LoadingState message="Loading course…" />
      </main>
    );
  }
  if (!course) {
    return (
      <main className="course-detail-page">
        <LoadingState variant="error" message="Course not found." />
      </main>
    );
  }

  return (
    <>
      <main className="course-detail-page">
        <BackButton destination="Courses" onClick={() => navigate('/dashboard/courses')} />
        <div className="course-detail-header">
        <h2>{course.title}{course.certification_type ? ` ${course.certification_type}` : ''}</h2>
        <div className="header-actions">
          <button className="status-toggle" onClick={handleToggleStatus}>
            Mark as {course.status === 'active' ? 'Inactive' : 'Active'}
          </button>
          <button className="btn-delete" onClick={handleDeleteCourse}>
            Delete Course
          </button>
        </div>
      </div>

      <section className="course-info-section">
        <div className="section-header">
          <h3>Course Information</h3>
          {!isEditingInfo && (
            <button className="section-edit-btn" onClick={handleStartEditingInfo} title="Edit section">
              <img src={pencilIcon} alt="Edit" className="pencil-icon" />
            </button>
          )}
        </div>

        {isEditingInfo ? (
          <div className="info-edit-grid">
            <div className="title-cert-row">
              <label>
                <span>Title <span className="required-mark">*</span></span>
                <input
                  name="title"
                  value={infoForm.title}
                  onChange={handleTitleChange}
                  placeholder="e.g. Computer Systems Servicing (without the NC level)"
                  required
                />
                <FieldError message={infoFieldErrors.title} />
              </label>
              <label>
                <span>NC Level <span className="required-mark">*</span></span>
                <select name="certification_id" value={infoForm.certification_id} onChange={handleInfoChange} required>
                  <option value="">- Select -</option>
                  {certificationTypes.map((c) => (
                    <option key={c.certification_id} value={c.certification_id}>
                      {c.certification_type}
                    </option>
                  ))}
                </select>
                <FieldError message={infoFieldErrors.certification_id} />
              </label>
            </div>
            <label className="span-2">
              <span>Description <span className="required-mark">*</span></span>
              <textarea name="description" value={infoForm.description} onChange={handleInfoChange} required />
              <FieldError message={infoFieldErrors.description} />
            </label>
            <label>
              <span>Accreditation No. <span className="required-mark">*</span></span>
              <input name="accreditation_no" value={infoForm.accreditation_no} onChange={handleInfoChange} required />
              <FieldError message={infoFieldErrors.accreditation_no} />
            </label>
            <label>
              <span>Sector <span className="required-mark">*</span></span>
              <select name="sector_id" value={infoForm.sector_id} onChange={handleInfoChange} required>
                <option value="">- Select Sector -</option>
                {sectors.map((s) => (
                  <option key={s.sector_id} value={s.sector_id}>
                    {s.sector}
                  </option>
                ))}
              </select>
              <FieldError message={infoFieldErrors.sector_id} />
            </label>
            <label>
              <span>Date Accredited <span className="required-mark">*</span></span>
              <input type="date" name="date_accredited" value={infoForm.date_accredited} onChange={handleInfoChange} required />
              <FieldError message={infoFieldErrors.date_accredited} />
            </label>
            <label>
              <span>Expiration Date <span className="required-mark">*</span></span>
              <input
                type="date"
                name="expiration_date"
                value={infoForm.expiration_date}
                onChange={handleInfoChange}
                min={infoForm.date_accredited || undefined}
                required
              />
              <FieldError message={infoFieldErrors.expiration_date} />
            </label>
            <label>
              <span>Fee (₱) <span className="required-mark">*</span></span>
              <input type="number" name="amount" min="0" step="0.01" value={infoForm.amount} onChange={handleInfoChange} required />
              <FieldError message={infoFieldErrors.amount} />
            </label>
            <label>
              <span>Training Hours <span className="required-mark">*</span></span>
              <input type="number" name="hours" min="1" value={infoForm.hours} onChange={handleInfoChange} required />
              <FieldError message={infoFieldErrors.hours} />
            </label>

            {infoErrorMsg && <p className="form-error span-2">{infoErrorMsg}</p>}

            <div className="edit-actions span-2">
              <button className="btn-secondary" onClick={() => setIsEditingInfo(false)} disabled={isSaving}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSaveInfo} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="info-view-grid">
            <div>
              <span className="field-label">Description</span>
              <p>{course.description || '-'}</p>
            </div>
            <div>
              <span className="field-label">Accreditation No.</span>
              <p>{course.accreditation_no}</p>
            </div>
            <div>
              <span className="field-label">Sector</span>
              <p>{course.sector_name || '-'}</p>
            </div>
            <div>
              <span className="field-label">National Certification Level</span>
              <p>{course.certification_type || '-'}</p>
            </div>
            <div>
              <span className="field-label">Date Accredited</span>
              <p>{course.date_accredited?.slice(0, 10)}</p>
            </div>
            <div>
              <span className="field-label">Expiration Date</span>
              <p>{course.expiration_date?.slice(0, 10)}</p>
            </div>
            <div>
              <span className="field-label">Fee</span>
              <p>₱{course.amount}</p>
            </div>
            <div>
              <span className="field-label">Training Hours</span>
              <p>{course.hours}</p>
            </div>
          </div>
        )}
      </section>

      <section className="competencies-section">
        <h3>Competencies</h3>
        <table className="competency-table">
          <tbody>
            {renderCompetencySection('basic', 'Basic Competencies', course.competencies.basic)}
            {renderCompetencySection('common', 'Common Competencies', course.competencies.common)}
            {renderCompetencySection('core', 'Core Competencies', course.competencies.core)}
          </tbody>
        </table>
      </section>

      <section className="competencies-section">
        <h3>Potential Job Opportunities</h3>
        <div className="competency-block">
          <div className="competency-block-header">
            <h4>Career Opportunities</h4>
            <button className="btn-add-row" onClick={startAddJobRow}>
              + Add Row
            </button>
          </div>
          <table className="competency-table">
            <thead>
              <tr>
                <th>Job Title</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(course.jobOpportunities ?? []).map((row) =>
                editingJobId === row.id ? (
                  <tr key={row.id}>
                    <td>
                      <input
                        value={editJobTitle}
                        onChange={handleEditJobChange}
                        required
                      />
                      <FieldError message={editJobError} />
                    </td>
                    <td className="row-actions">
                      <button onClick={submitEditJobRow}>Save</button>
                      <button onClick={cancelEditJobRow}>Cancel</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={row.id}>
                    <td>{row.job_title}</td>
                    <td className="row-actions">
                      <button className="icon-btn" onClick={() => startEditJobRow(row)} title="Edit">
                        <img src={pencilIcon} alt="Edit" className="pencil-icon" />
                      </button>
                      <button className="icon-btn" onClick={() => handleDeleteJobRow(row.id)} title="Delete">
                        <img src={trashIcon} alt="Delete" className="trash-icon" />
                      </button>
                    </td>
                  </tr>
                )
              )}
              {newJobRow && (
                <tr>
                  <td>
                    <input
                      value={newJobRow.job_title}
                      onChange={handleNewJobChange}
                      required
                    />
                    <FieldError message={newJobError} />
                  </td>
                  <td className="row-actions">
                    <button onClick={submitNewJobRow}>Save</button>
                    <button onClick={cancelAddJobRow}>Cancel</button>
                  </td>
                </tr>
              )}
              {(course.jobOpportunities ?? []).length === 0 && !newJobRow && (
                <tr>
                  <td colSpan="2" className="competency-empty">
                    No job opportunities listed yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="competencies-section">
        <h3>Enrollment Requirements</h3>
        <div className="competency-block">
          <div className="competency-block-header">
            <h4>Documents Required at Enrollment</h4>
            <button className="btn-add-row" onClick={startAddRequirementRow}>
              + Add Row
            </button>
          </div>
          <table className="competency-table">
            <thead>
              <tr>
                <th>Requirement</th>
                <th className="col-required">Required?</th>
                <th className="col-max-files">Max Files</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(course.requirements ?? []).map((row) =>
                editingRequirementId === row.id ? (
                  <tr key={row.id}>
                    <td>
                      <input
                        value={editRequirementForm.document_type}
                        onChange={handleEditRequirementChange}
                        required
                      />
                      <FieldError message={editRequirementError} />
                    </td>
                    <td className="col-required">
                      <input
                        type="checkbox"
                        className="competency-checkbox"
                        checked={editRequirementForm.is_required}
                        onChange={handleEditRequirementToggle}
                      />
                    </td>
                    <td className="col-max-files">
                      <input
                        type="number"
                        className="max-files-input"
                        min="1"
                        value={editRequirementForm.max_files}
                        onChange={handleEditRequirementMaxFilesChange}
                      />
                    </td>
                    <td className="row-actions">
                      <button onClick={submitEditRequirementRow}>Save</button>
                      <button onClick={cancelEditRequirementRow}>Cancel</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={row.id}>
                    <td>{row.document_type}</td>
                    <td className="col-required">{row.is_required ? 'Required' : 'Optional'}</td>
                    <td className="col-max-files">{row.max_files}</td>
                    <td className="row-actions">
                      <button className="icon-btn" onClick={() => startEditRequirementRow(row)} title="Edit">
                        <img src={pencilIcon} alt="Edit" className="pencil-icon" />
                      </button>
                      <button className="icon-btn" onClick={() => handleDeleteRequirementRow(row.id)} title="Delete">
                        <img src={trashIcon} alt="Delete" className="trash-icon" />
                      </button>
                    </td>
                  </tr>
                )
              )}
              {newRequirementRow && (
                <tr>
                  <td>
                    <input
                      value={newRequirementRow.document_type}
                      onChange={handleNewRequirementChange}
                      placeholder="e.g. PSA Birth Certificate"
                      required
                    />
                    <FieldError message={newRequirementError} />
                  </td>
                  <td className="col-required">
                    <input
                      type="checkbox"
                      className="competency-checkbox"
                      checked={newRequirementRow.is_required}
                      onChange={handleNewRequirementToggle}
                    />
                  </td>
                  <td className="col-max-files">
                    <input
                      type="number"
                      className="max-files-input"
                      min="1"
                      value={newRequirementRow.max_files}
                      onChange={handleNewRequirementMaxFilesChange}
                    />
                  </td>
                  <td className="row-actions">
                    <button onClick={submitNewRequirementRow}>Save</button>
                    <button onClick={cancelAddRequirementRow}>Cancel</button>
                  </td>
                </tr>
              )}
              {(course.requirements ?? []).length === 0 && !newRequirementRow && (
                <tr>
                  <td colSpan="4" className="competency-empty">
                    No requirements set yet. This course will fall back to no enrollment document uploads until you add some.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ACTIVITY LOGS - now rendered through the shared LogComponent
          instead of a copy-pasted table, same visual pattern as before */}
      <div className="adm-batch-section">
        <p className="adm-section-title">
          Activity Logs
          <span className="adm-section-count-inline">{logs.length}</span>
        </p>

        <LogComponent
          logs={logs}
          columns={logColumns}
          getRowId={(log) => log.log_id}
          loading={logsLoading}
          emptyMessage="No activity recorded for this course yet."
          renderDetail={(log) => <p>{log.action_detail || '-'}</p>}
        />
      </div>
      </main>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        message={confirmModal.message}
        onConfirm={handleConfirmYes}
        onCancel={closeConfirm}
      />
    </>
  );
}
