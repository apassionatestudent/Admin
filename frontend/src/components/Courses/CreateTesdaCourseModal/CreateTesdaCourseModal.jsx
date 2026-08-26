import React, { useEffect, useState } from 'react';
import axiosAdmin from '../../../utils/axiosAdmin.js';
import '../CreateTesdaCourseModal/CreateTesdaCourseModal.css';

const emptyCompetencyRow = () => ({ code: '', competency: '' });
const emptyJobRow = () => ({ job_title: '' });
const emptyRequirementRow = () => ({ document_type: '', is_required: true, max_files: 1 });

// => Title must not contain the NC level itself - it's selected separately
// => via dropdown and concatenated for display (e.g. "Computer Systems
// => Servicing" + "NCII" -> "Computer Systems Servicing NCII"). Mirrors the
// => server-side check in tesdaCourseService.js.
const NC_LEVEL_PATTERN = /\bNC\s?I{1,3}V?\b/i;

// => Auto Title Cases Title and Job Title fields as the admin types -
// => capitalizes the first letter after every space (and at the very
// => start), leaves every other character exactly as typed so intentional
// => casing (e.g. acronyms) isn't fought. Naive setState on every keystroke
// => resets the cursor to the end of the input, so the cursor position is
// => explicitly restored via requestAnimationFrame after React re-renders
// => with the formatted value.
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
// => "ELC315202"). Stripping spaces changes the string length, which can
// => shift where the cursor should land - unlike applyTitleCase (same-length
// => transform), this counts how many characters were removed before the
// => cursor and adjusts the restored position accordingly.
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

// => Formats a Date as YYYY-MM-DD using LOCAL time parts, not
// => toISOString() (which converts to UTC first and can land on the wrong
// => day depending on the admin's browser timezone vs UTC). This only needs
// => to match whatever the browser's <input type="date"> itself produces,
// => which is always local.
const getLocalDateString = (dateObj) => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTodayString = () => getLocalDateString(new Date());
const getTomorrowString = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return getLocalDateString(d);
};

// => Live per-field validators - run on every keystroke/change, not just on
// => submit. Each returns an error string (shown below that field) or ''
// => when the current value is acceptable. expiration_date's validator takes
// => the whole form so it can compare against date_accredited's live value.
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
  date_accredited: (val) => {
    if (!val) return 'Date Accredited is required.';
    if (val > getTodayString()) return 'Cannot be a future date.'; // => today or past only
    return '';
  },
  expiration_date: (val, form) => {
    if (!val) return 'Expiration Date is required.';
    if (val < getTomorrowString()) return 'Must be a future date (tomorrow or later).'; // => today itself is not allowed
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

// => Small inline component so every field's error renders the same way -
// => defined once per file rather than repeating the JSX pattern each time
const FieldError = ({ message }) => (message ? <span className="field-error">{message}</span> : null);

export default function CreateTesdaCourseModal({ onClose, onCreated }) {
  const [sectors, setSectors] = useState([]);
  const [certificationTypes, setCertificationTypes] = useState([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    accreditation_no: '',
    date_accredited: '',
    expiration_date: '',
    sector_id: '',
    certification_id: '',
    amount: '',
    hours: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [competencies, setCompetencies] = useState({
    basic: [emptyCompetencyRow()],
    common: [emptyCompetencyRow()],
    core: [emptyCompetencyRow()],
  });
  // => Mirrors the shape of `competencies` - one { code, competency } error
  // => pair per row, per type
  const [competencyErrors, setCompetencyErrors] = useState({
    basic: [{ code: '', competency: '' }],
    common: [{ code: '', competency: '' }],
    core: [{ code: '', competency: '' }],
  });
  // => Section-level error, separate from the per-row errors above - fires
  // => when a whole type (basic/common/core) has zero fully-filled rows at
  // => submit time, e.g. all rows were removed or left half-blank
  const [competencySectionErrors, setCompetencySectionErrors] = useState({
    basic: '',
    common: '',
    core: '',
  });
  // => Same shape/pattern as competencies: an array of rows plus a parallel
  // => array of per-row "label is required" errors, plus one section-level
  // => "at least one row" error - mirrors the detail page's requirement rows
  const [requirements, setRequirements] = useState([emptyRequirementRow()]);
  const [requirementErrors, setRequirementErrors] = useState(['']);
  const [requirementsSectionError, setRequirementsSectionError] = useState('');
  const [jobOpportunities, setJobOpportunities] = useState([emptyJobRow()]);
  const [jobErrors, setJobErrors] = useState(['']);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    axiosAdmin
      .get('/api/admin/sectors')
      .then((res) => setSectors(res.data.data))
      .catch((err) => console.error('Failed to load sectors:', err));

    axiosAdmin
      .get('/api/admin/tesda-courses/certification-types')
      .then((res) => setCertificationTypes(res.data.data))
      .catch((err) => console.error('Failed to load certification types:', err));
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const updatedForm = { ...form, [name]: value };
    setForm(updatedForm);

    const validator = validators[name];
    if (validator) {
      setFieldErrors((prev) => ({ ...prev, [name]: validator(value, updatedForm) }));
    }

    // => Expiration Date's validity depends on Date Accredited, so re-check
    // => it too whenever Date Accredited itself changes
    if (name === 'date_accredited' && updatedForm.expiration_date) {
      setFieldErrors((prev) => ({
        ...prev,
        expiration_date: validators.expiration_date(updatedForm.expiration_date, updatedForm),
      }));
    }
  };

  const handleTitleChange = (e) => {
    applyTitleCase(e, (val) => {
      const updatedForm = { ...form, title: val };
      setForm(updatedForm);
      setFieldErrors((prev) => ({ ...prev, title: validators.title(val) }));
    });
  };

  // => Reuses applyCodeFormat (already used for competency codes) - strips
  // => spaces and forces uppercase on every keystroke/paste, so an
  // => accreditation number like "tr 1234567" becomes "TR1234567" as the
  // => admin types, same live-format behavior as the Code fields below.
  const handleAccreditationNoChange = (e) => {
    applyCodeFormat(e, (val) => {
      const updatedForm = { ...form, accreditation_no: val };
      setForm(updatedForm);
      setFieldErrors((prev) => ({ ...prev, accreditation_no: validators.accreditation_no(val) }));
    });
  };

  const handleCompetencyChange = (type, index, field, value) => {
    setCompetencies((prev) => {
      const rows = [...prev[type]];
      rows[index] = { ...rows[index], [field]: value };
      return { ...prev, [type]: rows };
    });
    setCompetencyErrors((prev) => {
      const rows = [...prev[type]];
      rows[index] = { ...rows[index], [field]: value.trim() ? '' : `${field === 'code' ? 'Code' : 'Description'} is required.` };
      return { ...prev, [type]: rows };
    });
    // => Clear the "at least one required" section error the moment typing
    // => produces a fully-filled row, so it doesn't sit there stale
    setCompetencySectionErrors((prev) => (prev[type] ? { ...prev, [type]: '' } : prev));
  };

  const addCompetencyRow = (type) => {
    setCompetencies((prev) => ({ ...prev, [type]: [...prev[type], emptyCompetencyRow()] }));
    setCompetencyErrors((prev) => ({ ...prev, [type]: [...prev[type], { code: '', competency: '' }] }));
  };

  const removeCompetencyRow = (type, index) => {
    setCompetencies((prev) => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== index),
    }));
    setCompetencyErrors((prev) => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== index),
    }));
  };

  const handleRequirementChange = (index, field, value) => {
    setRequirements((prev) => {
      const rows = [...prev];
      rows[index] = { ...rows[index], [field]: value };
      return rows;
    });
    if (field === 'document_type') {
      setRequirementErrors((prev) => {
        const rows = [...prev];
        rows[index] = value.trim() ? '' : 'Requirement label is required.';
        return rows;
      });
      // => Clear the section-level "at least one required" error as soon as
      // => a label is typed, same pattern as the competency sections
      setRequirementsSectionError((prev) => (value.trim() ? '' : prev));
    }
  };

  // => Clamped to a minimum of 1 in the handler itself - a student can never
  // => be shown an upload field that accepts zero files. Matches the same
  // => clamp used on the detail page's Add/Edit requirement rows.
  const handleRequirementMaxFilesChange = (index, e) => {
    const val = Math.max(1, Number(e.target.value) || 1);
    handleRequirementChange(index, 'max_files', val);
  };

  const addRequirementRow = () => {
    setRequirements((prev) => [...prev, emptyRequirementRow()]);
    setRequirementErrors((prev) => [...prev, '']);
  };

  const removeRequirementRow = (index) => {
    setRequirements((prev) => prev.filter((_, i) => i !== index));
    setRequirementErrors((prev) => prev.filter((_, i) => i !== index));
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
    // => in case any field was never touched (so its live check never fired)
    const newFieldErrors = {};
    let hasError = false;
    for (const key of Object.keys(validators)) {
      const message = validators[key](form[key], form);
      newFieldErrors[key] = message;
      if (message) hasError = true;
    }
    setFieldErrors(newFieldErrors);

    // => At least one FULLY FILLED row (both code and description) is
    // => required per competency type. A row with only one field filled
    // => doesn't count - it gets silently stripped as incomplete right
    // => before the request is sent anyway (see cleanedCompetencies below).
    const newSectionErrors = { basic: '', common: '', core: '' };
    let hasSectionError = false;
    for (const type of ['basic', 'common', 'core']) {
      const hasCompleteRow = competencies[type].some((row) => row.code.trim() && row.competency.trim());
      if (!hasCompleteRow) {
        newSectionErrors[type] = `At least one ${type} competency is required.`;
        hasSectionError = true;
      }
    }
    setCompetencySectionErrors(newSectionErrors);

    // => At least one requirement row with a filled-in label is required,
    // => same "at least one" rule as each competency type above
    const hasCompleteRequirement = requirements.some((r) => r.document_type.trim());
    if (!hasCompleteRequirement) {
      setRequirementsSectionError('At least one enrollment requirement is required.');
      hasSectionError = true;
    } else {
      setRequirementsSectionError('');
    }

    if (hasError || hasSectionError) {
      setErrorMsg('Please fix the highlighted fields before saving.');
      return;
    }

    setIsSaving(true);
    try {
      // => Strip blank rows before sending - backend also skips incomplete
      // => rows silently, but no point sending junk over the wire
      const cleanedCompetencies = {
        basic: competencies.basic.filter((r) => r.code && r.competency),
        common: competencies.common.filter((r) => r.code && r.competency),
        core: competencies.core.filter((r) => r.code && r.competency),
      };
      const cleanedJobOpportunities = jobOpportunities.filter((j) => j.job_title.trim());
      const cleanedRequirements = requirements
        .filter((r) => r.document_type.trim())
        .map((r) => ({
          document_type: r.document_type.trim(),
          is_required: r.is_required,
          max_files: r.max_files,
        }));

      await axiosAdmin.post('/api/admin/tesda-courses', {
        course: {
          ...form,
          sector_id: form.sector_id || null,
          amount: form.amount || 0,
          hours: Number(form.hours),
        },
        competencies: cleanedCompetencies,
        jobOpportunities: cleanedJobOpportunities,
        requirements: cleanedRequirements,
      });

      onCreated();
    } catch (error) {
      console.error('Failed to create TESDA course:', error);
      setErrorMsg(error.response?.data?.message || 'Failed to create course.');
    } finally {
      setIsSaving(false);
    }
  };

  const renderCompetencySection = (type, label) => (
    <div className="competency-section">
      <h4>{label} <span className="required-mark">*</span></h4>
      <FieldError message={competencySectionErrors[type]} />
      {competencies[type].map((row, index) => (
        <div className="competency-row" key={index}>
          <div className="competency-row-field">
            <input
              type="text"
              placeholder="Code"
              value={row.code}
              onChange={(e) => applyCodeFormat(e, (val) => handleCompetencyChange(type, index, 'code', val))}
              required
            />
            <FieldError message={competencyErrors[type][index]?.code} />
          </div>
          <div className="competency-row-field">
            <input
              type="text"
              placeholder="Competency description"
              value={row.competency}
              onChange={(e) => handleCompetencyChange(type, index, 'competency', e.target.value)}
              required
            />
            <FieldError message={competencyErrors[type][index]?.competency} />
          </div>
          {competencies[type].length > 1 && (
            <button type="button" className="btn-remove-row" onClick={() => removeCompetencyRow(type, index)}>
              ✕
            </button>
          )}
        </div>
      ))}
      <button type="button" className="btn-add-row" onClick={() => addCompetencyRow(type)}>
        + Add {label} Row
      </button>
    </div>
  );

  return (
    // => onClick removed here on purpose - clicking outside the modal must
    // => NOT close it, only the explicit X button or the Cancel button
    // => should. stopPropagation() below is now dead code (no parent
    // => handler left to stop) but harmless, kept as-is.
    <div className="modal-overlay">
      <div className="modal-content create-course-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add TESDA Course</h3>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <p className="form-reminder">
            Please review every field carefully before saving - this information will be shown to
            prospective students once the course is saved.
          </p>

          <div className="form-grid">
            <div className="title-cert-row">
              <label>
                <span>Title <span className="required-mark">*</span></span>
                <input
                  type="text"
                  name="title"
                  value={form.title}
                  onChange={handleTitleChange}
                  placeholder="e.g. Computer Systems Servicing (without the NC level)"
                  required
                />
                <FieldError message={fieldErrors.title} />
              </label>
              <label>
                <span>NC Level <span className="required-mark">*</span></span>
                <select name="certification_id" value={form.certification_id} onChange={handleChange} required>
                  <option value="">- Select -</option>
                  {certificationTypes.map((c) => (
                    <option key={c.certification_id} value={c.certification_id}>
                      {c.certification_type}
                    </option>
                  ))}
                </select>
                <FieldError message={fieldErrors.certification_id} />
              </label>
            </div>

            <label className="span-2">
              <span>Description <span className="required-mark">*</span></span>
              <textarea name="description" value={form.description} onChange={handleChange} required />
              <FieldError message={fieldErrors.description} />
            </label>

            <label>
              <span>Accreditation No. <span className="required-mark">*</span></span>
              <input
                type="text"
                name="accreditation_no"
                value={form.accreditation_no}
                onChange={handleAccreditationNoChange}
                required
              />
              <FieldError message={fieldErrors.accreditation_no} />
            </label>

            <label>
              <span>Sector <span className="required-mark">*</span></span>
              <select name="sector_id" value={form.sector_id} onChange={handleChange} required>
                <option value="">- Select Sector -</option>
                {sectors.map((s) => (
                  <option key={s.sector_id} value={s.sector_id}>
                    {s.sector}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.sector_id} />
            </label>

            <label>
              <span>Date Accredited <span className="required-mark">*</span></span>
              <input
                type="date"
                name="date_accredited"
                value={form.date_accredited}
                onChange={handleChange}
                max={getTodayString()} // => blocks picking a future date directly from the calendar widget
                required
              />
              <FieldError message={fieldErrors.date_accredited} />
            </label>

            <label>
              <span>Expiration Date <span className="required-mark">*</span></span>
              <input
                type="date"
                name="expiration_date"
                value={form.expiration_date}
                onChange={handleChange}
                min={getTomorrowString()} // => blocks picking today or a past date directly from the calendar widget
                required
              />
              <FieldError message={fieldErrors.expiration_date} />
            </label>

            <label>
              <span>Fee (₱) <span className="required-mark">*</span></span>
              <input type="number" name="amount" min="0" step="0.01" value={form.amount} onChange={handleChange} required />
              <FieldError message={fieldErrors.amount} />
            </label>

            <label>
              <span>Training Hours <span className="required-mark">*</span></span>
              <input type="number" name="hours" min="1" value={form.hours} onChange={handleChange} required />
              <FieldError message={fieldErrors.hours} />
            </label>
          </div>

          {renderCompetencySection('basic', 'Basic Competencies')}
          {renderCompetencySection('common', 'Common Competencies')}
          {renderCompetencySection('core', 'Core Competencies')}

          <div className="competency-section">
            <h4>Enrollment Requirements <span className="required-mark">*</span></h4>
            <FieldError message={requirementsSectionError} />
            {requirements.map((row, index) => (
              <div className="requirement-row" key={index}>
                <div className="competency-row-field">
                  <input
                    type="text"
                    placeholder="e.g. PSA Birth Certificate"
                    value={row.document_type}
                    onChange={(e) => handleRequirementChange(index, 'document_type', e.target.value)}
                    required
                  />
                  <FieldError message={requirementErrors[index]} />
                </div>
                <label className="requirement-inline-checkbox">
                  <input
                    type="checkbox"
                    checked={row.is_required}
                    onChange={(e) => handleRequirementChange(index, 'is_required', e.target.checked)}
                  />
                  Required
                </label>
                <input
                  type="number"
                  min="1"
                  className="requirement-max-files"
                  value={row.max_files}
                  onChange={(e) => handleRequirementMaxFilesChange(index, e)}
                  title="Max files"
                />
                {requirements.length > 1 && (
                  <button type="button" className="btn-remove-row" onClick={() => removeRequirementRow(index)}>
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="btn-add-row" onClick={addRequirementRow}>
              + Add Requirement Row
            </button>
          </div>

          <div className="competency-section">
            <h4>Potential Job Opportunities</h4>
            {jobOpportunities.map((row, index) => (
              <div className="job-row" key={index}>
                <div className="competency-row-field">
                  <input
                    type="text"
                    placeholder="e.g. Pastry Chef"
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
