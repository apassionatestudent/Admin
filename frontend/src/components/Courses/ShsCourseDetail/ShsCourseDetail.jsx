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
// => Chevron icon for the Activity Logs section, same asset as TesdaCourseDetail.jsx
import chevronDown from '../../../assets/icons/chevron-down.png';
import './ShsCourseDetail.css';

// => Auto Title Cases Title and Job Title fields as the admin edits them -
// => same helper duplicated across the other course files per your policy.
// => Cursor position is restored via requestAnimationFrame since naive
// => setState on every keystroke would otherwise jump it to the end.
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

// => Basic sanity check for Course Link - same as the Create modal's
const isLikelyValidUrl = (url) => /^https?:\/\/[^\s]+\.[^\s]+/i.test(url);

// => Live per-field validators - run on every keystroke/change, not just on submit
const validators = {
  title: (val) => (!val.trim() ? 'Title is required.' : ''),
  description: (val) => (!val.trim() ? 'Description is required.' : ''),
  cluster_id: (val) => (!val ? 'Cluster is required.' : ''),
  grade_level: (val) => (!val ? 'Grade Level is required.' : ''),
  course_link: (val) => {
    if (!val.trim()) return 'Course Link is required.';
    if (!isLikelyValidUrl(val)) return 'Must be a valid URL starting with http:// or https://';
    return '';
  },
};

// => Small inline component so every field's error renders the same way
const FieldError = ({ message }) => (message ? <span className="field-error">{message}</span> : null);

export default function ShsCourseDetail() {
  const { adminUuid } = useParams();
  const navigate = useNavigate();

  const [course, setCourse] = useState(null);
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  // => Synchronous guard against double-submit. React state (isSaving) only
  // => blocks the button AFTER a re-render, so a fast double-click can still
  // => slip a second request through in that gap. A ref updates instantly.
  const isSavingRef = useRef(false);
  const [formErrorMsg, setFormErrorMsg] = useState('');

  // => One shared ConfirmModal instance for every delete action on this page
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
  // => Which log row is currently expanded to show its full action_detail
  const [expandedLogId, setExpandedLogId] = useState(null);

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await axiosAdmin.get(`/api/admin/shs-courses/${adminUuid}/logs`);
      setLogs(res.data.data || []);
    } catch (error) {
      console.error('Failed to fetch course logs:', error);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    fetchCourse();
    fetchLogs();
    axiosAdmin
      .get('/api/admin/clusters')
      .then((res) => setClusters(res.data.data))
      .catch((err) => console.error('Failed to load clusters:', err));
  }, [adminUuid]);

  const fetchCourse = async () => {
    setLoading(true);
    try {
      const res = await axiosAdmin.get(`/api/admin/shs-courses/${adminUuid}`);
      const data = res.data.data;
      setCourse(data);
      setForm({
        title: data.title,
        description: data.description || '',
        cluster_id: data.cluster_id,
        grade_level: data.grade_level,
        course_link: data.course_link || '',
      });
    } catch (error) {
      console.error('Failed to load course:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
    const validator = validators[name];
    if (validator) {
      setFieldErrors((prev) => ({ ...prev, [name]: validator(value) }));
    }
  };

  const handleTitleChange = (e) => {
    applyTitleCase(e, (val) => {
      setForm((prev) => ({ ...prev, title: val }));
      setFieldErrors((prev) => ({ ...prev, title: validators.title(val) }));
    });
  };

  // => Live onChange validation only catches fields the admin actually types
  // => into - a field already invalid before edit mode opened (e.g. a
  // => course_link that was left blank on an older record) would otherwise
  // => show no error until touched or until Save is clicked. Running the
  // => full validator sweep the moment Edit opens surfaces pre-existing
  // => gaps immediately instead.
  const handleStartEditing = () => {
    const initialErrors = {};
    for (const key of Object.keys(validators)) {
      initialErrors[key] = validators[key](form[key]);
    }
    setFieldErrors(initialErrors);
    setIsEditing(true);
  };

  const handleSave = async () => {
    // => Bail immediately if a save is already in flight - blocks double
    // => clicks synchronously, before React even gets a chance to re-render
    // => the disabled button
    if (isSavingRef.current) return;

    setFormErrorMsg('');

    // => Final safety net on Save - re-runs every field's live validator in
    // => case any field was never touched
    const newFieldErrors = {};
    let hasError = false;
    for (const key of Object.keys(validators)) {
      const message = validators[key](form[key]);
      newFieldErrors[key] = message;
      if (message) hasError = true;
    }
    setFieldErrors(newFieldErrors);

    if (hasError) {
      setFormErrorMsg('Please fix the highlighted fields before saving.');
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const res = await axiosAdmin.patch(`/api/admin/shs-courses/${adminUuid}`, form);
      const updated = res.data.data;

      // => updateShsCourse's RETURNING * only returns shs_courses' own
      // => columns - cluster_name is a joined display field that only comes
      // => back from the SELECT-with-JOIN queries, not a plain UPDATE.
      // => Resolving it from the clusters list already in state avoids a
      // => network round-trip while keeping the displayed label accurate.
      const matchedCluster = clusters.find((c) => c.cluster_id === updated.cluster_id);

      setCourse((prev) => ({
        ...prev,
        ...updated,
        cluster_name: matchedCluster ? matchedCluster.name : prev.cluster_name,
      }));
      setIsEditing(false);
      // => Refresh the Activity Log so the new UPDATE entry appears without a page reload
      await fetchLogs();
    } catch (error) {
      console.error('Failed to update course:', error);
      setFormErrorMsg(error.response?.data?.message || 'Failed to update course.');
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
  };

  const handleToggleStatus = async () => {
    const newStatus = course.status === 'active' ? 'inactive' : 'active';
    openConfirm(`Change status to ${newStatus}? This can be changed later.`, async () => { 
      try {
        const res = await axiosAdmin.patch(`/api/admin/shs-courses/${adminUuid}`, { status: newStatus });
        setCourse((prev) => ({ ...prev, status: res.data.data.status }));
        // => Refresh the Activity Log so the new STATUS_CHANGE entry appears without a page reload
        await fetchLogs();
      } catch (error) {
        console.error('Failed to toggle status:', error);
        // => Surfaces the backend's reactivation-guard message (e.g.
        // => cluster deleted) instead of failing silently
        toast.error(error.response?.data?.message || 'Failed to change status.');
      }
    });
    
  };

  const handleDelete = () => {
    openConfirm('Delete this course? This will be archived.', async () => {
      try {
        await axiosAdmin.delete(`/api/admin/shs-courses/${adminUuid}`);
        navigate('/dashboard/courses');
      } catch (error) {
        console.error('Failed to delete course:', error);
      }
    });
  };

  // => Job opportunities - same add/edit/delete-row pattern used in
  // => TesdaCourseDetail.jsx for competencies, single field instead of two
  const [newJobRow, setNewJobRow] = useState(null);
  const [newJobError, setNewJobError] = useState('');
  const [editingJobId, setEditingJobId] = useState(null);
  const [editJobTitle, setEditJobTitle] = useState('');
  const [editJobError, setEditJobError] = useState('');

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
      const res = await axiosAdmin.post(`/api/admin/shs-courses/${adminUuid}/job-opportunities`, {
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
      const res = await axiosAdmin.patch(`/api/admin/shs-courses/job-opportunities/${editingJobId}`, {
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
        await axiosAdmin.delete(`/api/admin/shs-courses/job-opportunities/${id}`);
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
          <h2>{course.title}</h2>
        <div className="header-actions">
          <button className="status-toggle" onClick={handleToggleStatus}>
            Mark as {course.status === 'active' ? 'Inactive' : 'Active'}
          </button>
          <button className="btn-delete" onClick={handleDelete}>
            Delete Course
          </button>
        </div>
      </div>

      <section className="course-info-section">
        <div className="section-header">
          <h3>Course Information</h3>
          {!isEditing && (
            <button className="section-edit-btn" onClick={handleStartEditing} title="Edit section">
              <img src={pencilIcon} alt="Edit" className="pencil-icon" />
            </button>
          )}
        </div>

        {isEditing ? (
          <div className="info-edit-grid">
            <label className="span-2">
              <span>Title <span className="required-mark">*</span></span>
              <input name="title" value={form.title} onChange={handleTitleChange} required />
              <FieldError message={fieldErrors.title} />
            </label>
            <label className="span-2">
              <span>Description <span className="required-mark">*</span></span>
              <textarea name="description" value={form.description} onChange={handleChange} required />
              <FieldError message={fieldErrors.description} />
            </label>
            <label>
              <span>Cluster <span className="required-mark">*</span></span>
              <select name="cluster_id" value={form.cluster_id} onChange={handleChange} required>
                {clusters.map((c) => (
                  <option key={c.cluster_id} value={c.cluster_id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.cluster_id} />
            </label>
            <label>
              <span>Grade Level <span className="required-mark">*</span></span>
              <select name="grade_level" value={form.grade_level} onChange={handleChange} required>
                <option value="Grade 11">Grade 11</option>
                <option value="Grade 12">Grade 12</option>
              </select>
              <FieldError message={fieldErrors.grade_level} />
            </label>
            <label className="span-2">
              <span>Course Link <span className="required-mark">*</span></span>
              <input type="url" name="course_link" value={form.course_link} onChange={handleChange} required />
              <FieldError message={fieldErrors.course_link} />
            </label>

            {formErrorMsg && <p className="form-error span-2">{formErrorMsg}</p>}

            <div className="edit-actions span-2">
              <button className="btn-secondary" onClick={() => setIsEditing(false)} disabled={isSaving}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSave} disabled={isSaving}>
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
              <span className="field-label">Cluster</span>
              <p>{course.cluster_name || '-'}</p>
            </div>
            <div>
              <span className="field-label">Grade Level</span>
              <p>{course.grade_level}</p>
            </div>
            <div>
              <span className="field-label">Course Link</span>
              <p>{course.course_link || '-'}</p>
            </div>
          </div>
        )}
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

      {/* ACTIVITY LOGS - chevron-expandable rows, matches the standardized
          pattern from TesdaBatchDetail/Facilities/Trainers/Support Tickets */}
      <div className="adm-batch-section">
        <p className="adm-section-title">
          Activity Logs
          <span className="adm-section-count-inline">{logs.length}</span>
        </p>

        {logsLoading && <p className="adm-empty-note">Loading logs…</p>}

        {!logsLoading && logs.length === 0 && (
          <p className="adm-empty-note">No activity recorded for this course yet.</p>
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const isExpanded = expandedLogId === log.log_id;
                  return (
                    <React.Fragment key={log.log_id}>
                      <tr
                        className="adm-log-row"
                        onClick={() => setExpandedLogId(isExpanded ? null : log.log_id)}
                      >
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
                        <td className="adm-log-detail-cell" title={log.action_detail || ''}>
                          {log.action_detail || '-'}
                        </td>
                        <td>
                          <img
                            src={chevronDown}
                            alt="Expand row"
                            className={`adm-log-chevron ${isExpanded ? 'adm-log-chevron-open' : ''}`}
                          />
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="adm-log-detail-row">
                          <td colSpan={5}>
                            <div className="adm-log-detail-full">
                              <p>{log.action_detail || '-'}</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
