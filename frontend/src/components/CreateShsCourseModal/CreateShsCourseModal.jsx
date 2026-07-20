import React, { useEffect, useState } from 'react';
import axiosAdmin from '../../api/axiosAdmin.js';
import '../CreateShsCourseModal/CreateShsCourseModal.css';

const emptyJobRow = () => ({ job_title: '' });

// => Auto Title Cases Title and Job Title fields as the admin types - same
// => helper as CreateTesdaCourseModal.jsx, duplicated per your policy rather
// => than shared. Capitalizes the first letter after every space (and at
// => the very start), leaves everything else exactly as typed. Cursor
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

// => Basic sanity check for the Course Link field - requires an http(s)
// => scheme and at least one dot in the host, backing up the native
// => type="url" validation with a clearer custom message
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

export default function CreateShsCourseModal({ onClose, onCreated }) {
  const [clusters, setClusters] = useState([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    cluster_id: '',
    grade_level: 'Grade 11',
    course_link: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [jobOpportunities, setJobOpportunities] = useState([emptyJobRow()]);
  const [jobErrors, setJobErrors] = useState(['']);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    axiosAdmin
      .get('/api/admin/clusters')
      .then((res) => setClusters(res.data.data))
      .catch((err) => console.error('Failed to load clusters:', err));
  }, []);

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

  const handleJobChange = (index, e) => {
    applyTitleCase(e, (val) => {
      setJobOpportunities((prev) => {
        const rows = [...prev];
        rows[index] = { job_title: val };
        return rows;
      });
      setJobErrors((prev) => {
        const rows = [...prev];
        rows[index] = val.trim() ? '' : 'Job title is required.';
        return rows;
      });
    });
  };

  const addJobRow = () => {
    setJobOpportunities((prev) => [...prev, emptyJobRow()]);
    setJobErrors((prev) => [...prev, '']);
  };

  const removeJobRow = (index) => {
    setJobOpportunities((prev) => prev.filter((_, i) => i !== index));
    setJobErrors((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    // => Final safety net on submit - re-runs every field's live validator
    // => in case any field was never touched
    const newFieldErrors = {};
    let hasError = false;
    for (const key of Object.keys(validators)) {
      const message = validators[key](form[key]);
      newFieldErrors[key] = message;
      if (message) hasError = true;
    }
    setFieldErrors(newFieldErrors);

    if (hasError) {
      setErrorMsg('Please fix the highlighted fields before saving.');
      return;
    }

    setIsSaving(true);
    try {
      const cleanedJobOpportunities = jobOpportunities.filter((j) => j.job_title.trim());

      await axiosAdmin.post('/api/admin/shs-courses', {
        course: {
          ...form,
          cluster_id: Number(form.cluster_id),
        },
        jobOpportunities: cleanedJobOpportunities,
      });
      onCreated();
    } catch (error) {
      console.error('Failed to create SHS course:', error);
      setErrorMsg(error.response?.data?.message || 'Failed to create course.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content create-course-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add SHS Course</h3>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <p className="form-reminder">
            Please review every field carefully before saving - this information will be shown to
            prospective students once the course is published.
          </p>

          <div className="form-grid">
            <label className="span-2">
              <span>Title <span className="required-mark">*</span></span>
              <input type="text" name="title" value={form.title} onChange={handleTitleChange} required />
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
                <option value="">- Select Cluster -</option>
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
              <input type="url" name="course_link" value={form.course_link} onChange={handleChange} placeholder="https://..." required />
              <FieldError message={fieldErrors.course_link} />
            </label>
          </div>

          <div className="competency-section">
            <h4>Potential Job Opportunities</h4>
            {jobOpportunities.map((row, index) => (
              <div className="job-row" key={index}>
                <div className="competency-row-field">
                  <input
                    type="text"
                    placeholder="e.g. Front Desk Officer"
                    value={row.job_title}
                    onChange={(e) => handleJobChange(index, e)}
                    required
                  />
                  <FieldError message={jobErrors[index]} />
                </div>
                {jobOpportunities.length > 1 && (
                  <button type="button" className="btn-remove-row" onClick={() => removeJobRow(index)}>
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="btn-add-row" onClick={addJobRow}>
              + Add Job Opportunity Row
            </button>
          </div>

          {errorMsg && <p className="form-error">{errorMsg}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Add Course'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
