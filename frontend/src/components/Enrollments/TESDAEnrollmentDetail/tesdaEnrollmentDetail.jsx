// => admin/components/TESDAEnrollmentDetail/tesdaEnrollmentDetail.jsx
// => Full TESDA enrollment detail for admins: student info, enrollment fields,
//    client classifications, NCAE, scholarship, submitted documents, audit
//    log, status changer, and section-level Edit Mode (CRUD).
// => Field names verified against the Site/Student Dashboard server.js schema
//    (tesda_enrollments, student_profile, student_address, student_guardian,
//    tesda_client_classifications, tesda_classes, tesda_documents).
// => Work Experience / Trainings / Licensures / Competencies sections removed -
//    those tables no longer exist in the schema (confirmed dead, was on TODO).
// => Edit Mode added: pencil icon per section, whole section becomes
//    editable, one Save/Cancel per section. Nothing is field-locked.
//    Course/Class reassignment stays read-only - deferred until a
//    proper picker endpoint exists (matches earlier project decision).

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import BackButton from '../../BackButton/BackButton.jsx';
// => axiosAdmin auto-attaches credentials + x-csrf-token on every mutating
//    call - required or csrfProtection middleware silently rejects PATCH/POST.
import axiosAdmin from '../../../utils/axiosAdmin.js';
import toast from 'react-hot-toast';

import './tesdaEnrollmentDetail.css';

// icons
import searchIcon from '../../../assets/icons/magnifying-glass.png';
import ConfirmModal from '../../../components/ConfirmModal/ConfirmModal.jsx';
// => Shared spinner/error block, replaces the local adm-detail-state markup below
import LoadingState from '../../LoadingState/loadingState.jsx';
import clipboardIcon from '../../../assets/icons/clipboard.png';
import checkMarkIcon from '../../../assets/icons/checkmark.png';
import errorIcon from '../../../assets/icons/warning.png';
import pencilIcon from '../../../assets/icons/pencil.png';
import trashIcon from '../../../assets/icons/trash.png';
import LogComponent from '../../../components/LogComponent/logComponent.jsx'; // => shared log table + pagination, chevron icon lives inside it now

// Constants

// => Matches ALLOWED_STATUSES in sharedEnrollmentService.js exactly
// => 'Completed' replaced with 'For Assessment'; 'Reviewed' and
//    'Failed Assessment' added, both landing after 'For Assessment' in
//    the natural progress order (assessed -> reviewed -> pass/fail)
const STATUS_OPTIONS = [
  'Pending', 'Reviewed', 'Approved', 'Needs Clarification', 'Rejected',
  'Dropped', 'For Assessment', 'Passed Assessment', 'Failed Assessment', 'Reserved',
];

const statusClass = {
  'Pending':             'status--pending',
  'Reviewed':            'status--reviewed',
  'Approved':            'status--approved',
  'Needs Clarification': 'status--clarification',
  'Rejected':            'status--rejected',
  'Dropped':             'status--dropped',
  'For Assessment':      'status--for-assessment',
  'Passed Assessment':   'status--passed-assessment',
  'Failed Assessment':   'status--failed-assessment',
  'Reserved':            'status--reserved',
};

// => Ported from shsEnrollmentDetail.jsx for parity - short explainer shown
//    next to the Save Status button for whichever status is selected
const STATUS_DESCRIPTIONS = {
  'Pending': 'Submitted and awaiting initial review.',
  'Reviewed': 'Enrollment has been reviewed with no issues. Student must submit physical photocopies of the documents along with the original ones as reference and pay the reservation fee if applicable to be approved.',
  'Approved': 'Reviewed and accepted - the student is officially enrolled.',
  'Needs Clarification': 'Missing or unclear information - waiting on the student to respond.',
  'Rejected': 'Enrollment was declined.',
  'Dropped': 'Student withdrew or was removed after being enrolled.',
  'For Assessment': 'Training finished - student is scheduled for competency assessment.',
  'Passed Assessment': 'Student passed the competency assessment and is certified.',
  'Failed Assessment': 'Student did not pass the competency assessment.',
  'Reserved': 'No open class section yet - held until one becomes available.',
};

// => Extra confirmation copy for consequential, student-visible status
//    changes - shown in the Confirm modal in addition to the base
//    "Change status to X?" question. Statuses not listed here just get
//    the base question with nothing extra appended.
const STATUS_CONFIRM_WARNINGS = {
  // => Appended a note about the batch capacity sweep - approving can
  //    fill the batch to max_students, which automatically moves every
  //    other Pending/Reviewed enrollment still in this batch back to
  //    Reserved (unassigned from the batch) so they can be placed in a
  //    future batch instead. The exact server-side outcome isn't knowable
  //    client-side, so this stays a general heads-up rather than a
  //    conditional message.
  'Approved': 'Please confirm the student has submitted physical photocopies of their documents and that these have been compared against the original copies before proceeding. Note: if this approval fills the batch to its max capacity, any other students still Pending or Reviewed in this same batch will automatically be moved back to Reserved so they can be placed in a future batch.',
  'Failed Assessment': 'This marks the assessment as failed and will be visible to the student on their dashboard.',
  'Rejected': 'This will reject the enrollment application and will be visible to the student on their dashboard.',
  'Dropped': 'This will mark the student as dropped from the program and will be visible to the student on their dashboard.',
};

// => Matches TESDAStep3.jsx exactly - the physical form only allows
//    selecting ONE classification, not several
const CLASSIFICATIONS = [
  { value: '4ps_beneficiary', label: '4Ps Beneficiary' },
  { value: 'agrarian_reform', label: 'Agrarian Reform Beneficiary' },
  { value: 'balik_probinsya', label: 'Balik Probinsya' },
  { value: 'displaced_workers', label: 'Displaced Workers' },
  { value: 'drug_dependents', label: 'Drug Dependents Surrenderees / Surrenderers' },
  { value: 'afp_pnp_killed', label: 'Family Members of AFP and PNP Killed-in-Action' },
  { value: 'afp_pnp_wounded', label: 'Family Members of AFP and PNP Wounded in-Action' },
  { value: 'farmers_fishermen', label: 'Farmers and Fishermen' },
  { value: 'indigenous_people', label: 'Indigenous People & Cultural Communities' },
  { value: 'industry_workers', label: 'Industry Workers' },
  { value: 'inmates_detainees', label: 'Inmates and Detainees' },
  { value: 'milf_beneficiary', label: 'MILF Beneficiary' },
  { value: 'out_of_school_youth', label: 'Out-of-School Youth' },
  { value: 'ofw_dependent', label: 'Overseas Filipino Workers (OFW) Dependent' },
  { value: 'rcef_resp', label: 'RCEF-RESP' },
  { value: 'rebel_returnees', label: 'Rebel Returnees / Decommissioned Combatants' },
  { value: 'returning_ofw', label: 'Returning / Repatriated Overseas Filipino Workers (OFW)' },
  { value: 'student', label: 'Student' },
  { value: 'tesda_alumni', label: 'TESDA Alumni' },
  { value: 'tvet_trainers', label: 'TVET Trainers' },
  { value: 'uniformed_personnel', label: 'Uniformed Personnel' },
  { value: 'disaster_victim', label: 'Victim of Natural Disasters and Calamities' },
  { value: 'wounded_afp_pnp', label: 'Wounded-in-Action AFP & PNP Personnel' },
  { value: 'others', label: 'Others' },
];

// => value -> label lookup, used for the read-only display so it shows
//    "4Ps Beneficiary" instead of the raw stored slug "4ps_beneficiary"
const CLASSIFICATION_LABELS = Object.fromEntries(CLASSIFICATIONS.map(c => [c.value, c.label]));

const SEX_OPTIONS = ['Male', 'Female'];

// => Matches student_profile.employment_status - no CHECK constraint in
//    server.js, so this is enforced at the UI layer only.
const EMPLOYMENT_OPTIONS = ['Employed', 'Unemployed'];

// => Age gate - mirrors TESDAStep2.jsx's MIN_AGE/MAX_AGE. Admins edit the
//    same student_profile.birth_date column students submit through, so
//    the same bounds apply here.
const MIN_STUDENT_AGE = 12;
const MAX_STUDENT_AGE = 100;

// => Computes the allowed <input type="date"> range - recomputed on each
//    render (not a module-level constant) so the page doesn't drift out
//    of date if left open across midnight.
const getAgeDateBounds = () => {
  const today = new Date();
  const toISO = (d) => d.toISOString().slice(0, 10);
  const maxDate = new Date(today.getFullYear() - MIN_STUDENT_AGE, today.getMonth(), today.getDate());
  const minDate = new Date(today.getFullYear() - MAX_STUDENT_AGE, today.getMonth(), today.getDate());
  return { min: toISO(minDate), max: toISO(maxDate) };
};

// => Validates a birth_date string (YYYY-MM-DD) against the 12-100 age gate
const validateAge = (dateStr) => {
  if (!dateStr) return 'Birthdate is required.';
  const [y, m, d] = dateStr.split('-').map(Number);
  const birth = new Date(y, m - 1, d);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  if (age < MIN_STUDENT_AGE) return `Student must be at least ${MIN_STUDENT_AGE} years old.`;
  if (age > MAX_STUDENT_AGE) return `Please check the birthdate - age exceeds ${MAX_STUDENT_AGE} years.`;
  return null;
};

// => Matches student_profile.civil_status - same list as TESDAStep2.jsx's
//    CIVIL_STATUS constant, so admin edits stay consistent with what
//    students actually submit.
const CIVIL_STATUS_OPTIONS = ['Single', 'Married', 'Widow/er', 'Separated', 'Solo Parent'];

// => Matches student_profile.name_extension - same list as TESDAStep1.jsx's
//    NAME_EXTENSIONS constant (also used by shsEnrollmentDetail.jsx).
const NAME_EXTENSIONS = ['N/A', 'Jr.', 'Sr.', 'II', 'III', 'IV', 'V'];

// => Matches student_profile.highest_educ_attainment - same list as
//    TESDAStep2.jsx's EDUC_ATTAINMENT constant.
const EDUC_ATTAINMENT_OPTIONS = [
  'No Grade Completed',
  'Elementary Undergraduate',
  'Elementary Graduate',
  'Pre-School (Nursery/Kinder/Prep)',
  'Post Secondary Undergraduate',
  'Post Secondary Graduate',
  'High School Undergraduate',
  'High School Graduate',
  'Junior High Graduate',
  'Senior High Graduate',
  'College Undergraduate',
  'College Graduate or Higher',
];

// Utility helpers
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
};

// => True only when the batch has an end_date AND today is on/after it.
//    Missing end_date counts as NOT ended - can't confirm training
//    finished without a date to check against. Used to gate the For
//    Assessment transition.
const isBatchTrainingEnded = (endDateStr) => {
  if (!endDateStr) return false;
  const batchEndDate = new Date(endDateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  batchEndDate.setHours(0, 0, 0, 0);
  return today >= batchEndDate;
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
};

const formatCurrency = (amount) => {
  if (amount == null) return '-';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
};

// => student_profile columns are last_name / first_name / middle_name / name_extension
const fullName = (p) =>
  [p.first_name, p.middle_name, p.last_name, p.name_extension]
    .filter(v => v && v.trim().toUpperCase() !== 'N/A')
    .join(' ') || '-';

// => Same validators as TESDAStep1.jsx, so admin edits are held to the same rules students followed at submission time.
const validateMobile = (value) => {
  if (!value) return null; // => admin is editing an existing record, field can stay blank
  if (!/^09\d{9}$/.test(value)) return 'Must start with 09 and be exactly 11 digits.';
  return null;
};

// => Same EMAIL_REGEX as TESDAStep1.jsx, SHSStep1.jsx, shsEnrollmentDetail
// => .jsx, and StudentDetail.jsx - all five touch the same
// => student_profile.email column, so they all enforce identically.
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const validateEmailFormat = (value) => {
  if (!value) return 'Email is required.';
  if (!EMAIL_REGEX.test(value)) return 'Please enter a valid email address.';
  return null;
};

// => Accepts facebook.com with no subdomain, www., or Meta's actual
// => "web." desktop subdomain. Same FACEBOOK_LINK_REGEX as
// => TESDAStep1.jsx, SHSStep1.jsx, shsEnrollmentDetail.jsx, and
// => StudentDetail.jsx.
const FACEBOOK_LINK_REGEX = /^(https?:\/\/)?(www\.|web\.)?facebook\.com\/.+$/i;
const validateFacebookLink = (value) => {
  if (!value) return null; // => admin is editing an existing record, field can stay blank
  if (!FACEBOOK_LINK_REGEX.test(value)) return 'Please enter a valid Facebook URL (e.g. https://www.facebook.com/yourname).';
  return null;
};

const toTitleCase = (value) => {
  return value
    .replace(/[^a-zA-Z\s\-']/g, '')
    .replace(/^\s+/, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/(^\w|(?<=[\s\-])\w)/g, (c) => c.toUpperCase());
};

// => Postgres DATE columns arrive as full ISO strings - slice to 10 chars
//    for <input type="date"> which needs exactly YYYY-MM-DD
const toDateInputValue = (dateStr) => (dateStr ? String(dateStr).slice(0, 10) : '');

// InfoCard - reusable read-only label+value cell
function InfoCard({ label, value, copyable = true }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!value || value === '-') return;
    navigator.clipboard.writeText(String(value)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="adm-info-card">
      <p className="adm-info-label">{label}</p>
      <div className="adm-info-value-row">
        <p className="adm-info-value">{value}</p>
        {copyable && value && value !== '-' && (
          <button
            className={`adm-copy-btn ${copied ? 'adm-copy-btn--copied' : ''}`}
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied ? (
              <img src={checkMarkIcon} className="adm-copy-icon" />
            ) : (
              <img src={clipboardIcon} className="adm-copy-icon" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// => EditableField - the edit-mode counterpart to InfoCard. type controls
//    the input rendered: 'text' | 'number' | 'date' | 'checkbox' | 'select'
function EditableField({ label, value, onChange, type = 'text', options = null, error = null, disabled = false, required = false, min = undefined, max = undefined }) {
  // => Required fields get a red asterisk, driven by server.js's NOT NULL
  //    constraints, not guesswork.
  const labelEl = (
    <p className="adm-info-label">
      {label}
      {required && <span className="adm-req-asterisk"> *</span>}
    </p>
  );

  // => Yes/No radio pair for boolean columns (ncae_taken, is_tesda_scholar).
  //    Replaces the old single checkbox - "No" is now an explicit,
  //    equally-weighted choice instead of an unchecked default, matching
  //    the radio pattern already used on TESDAStep4/TESDAStep5.
  if (type === 'yesno') {
    return (
      <div className="adm-info-card">
        {labelEl}
        <div className="adm-radio-row">
          <label className="adm-checkbox-item">
            <input type="radio" checked={value === true} disabled={disabled} onChange={() => onChange(true)} />
            <span>Yes</span>
          </label>
          <label className="adm-checkbox-item">
            <input type="radio" checked={value === false} disabled={disabled} onChange={() => onChange(false)} />
            <span>No</span>
          </label>
        </div>
      </div>
    );
  }

  if (type === 'checkbox') {
    return (
      <div className="adm-info-card">
        {labelEl}
        <label className="adm-edit-checkbox">
          <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} disabled={disabled} />
          <span>{value ? 'Yes' : 'No'}</span>
        </label>
      </div>
    );
  }

  if (type === 'select') {
    return (
      <div className="adm-info-card">
        {labelEl}
        <select className={`adm-edit-input ${error ? 'adm-edit-input--error' : ''}`} value={value ?? ''} onChange={e => onChange(e.target.value)} disabled={disabled}>
          <option value="">-- Select --</option>
          {(options || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {error && <span className="adm-edit-error">{error}</span>}
      </div>
    );
  }

  return (
    <div className="adm-info-card">
      {labelEl}
      <input
        className={`adm-edit-input ${error ? 'adm-edit-input--error' : ''}`}
        type={type}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        // => min/max only apply to type="date" - a no-op on other types
        min={min}
        max={max}
      />
      {error && <span className="adm-edit-error">{error}</span>}
    </div>
  );
}

// => SectionEditControls - pencil / Save / Cancel row shown next to each
//    section title. isEditing is derived by comparing editingSection to
//    this section's own key.
function SectionEditControls({ sectionKey, editingSection, saving, onEdit, onSave, onCancel }) {
  const isEditing = editingSection === sectionKey;
  return (
    <div className="adm-tesda-section-actions">
      {isEditing ? (
        <>
          <button className="adm-tesda-section-save-btn" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="adm-tesda-section-save-btn" onClick={onSave} disabled={saving}>
            Cancel
          </button>
        </>
      ) : (
        <button className="adm-tesda-section-edit-btn" onClick={onEdit} title="Edit section">
          <img src={pencilIcon} alt="Edit" className="adm-pencil-icon" />
        </button>
      )}
    </div>
  );
}

// => AddressCascadeFields - reusable cascading PSGC selector for edit mode.
//    Mirrors the exact fetch pattern from TESDAStep1.jsx/SHSStep1.jsx so
//    admin edits produce the same valid codes students' submissions do.
// => regionField/provinceField/cityField/barangayField are draft KEY NAMES,
//    not values - lets this same component serve both the Address section
//    (region_code/province_code/city_code/barangay_code) and TESDA's
//    Birthplace fields (birthplace_region/birthplace_province/birthplace_city,
//    no barangay - just omit barangayField).
function AddressCascadeFields({ draft, updateDraft, regionField, provinceField, cityField, barangayField }) {
  const [regions,   setRegions]   = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [cities,    setCities]    = useState([]);
  const [barangays, setBarangays] = useState([]);

  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingCities,    setLoadingCities]    = useState(false);
  const [loadingBarangays, setLoadingBarangays] = useState(false);

  const regionCode   = draft[regionField]   ?? '';
  const provinceCode = draft[provinceField] ?? '';
  const cityCode     = draft[cityField]     ?? '';
  const barangayCode = barangayField ? (draft[barangayField] ?? '') : null;

  const isNCR = regionCode === '1300000000';

  useEffect(() => {
    fetch('/api/location/regions')
      .then(r => r.json())
      .then(setRegions)
      .catch(err => console.error('Failed to fetch regions:', err));
  }, []);

  useEffect(() => {
    if (!regionCode) { setProvinces([]); setCities([]); return; }
    if (isNCR) {
      setLoadingCities(true);
      fetch(`/api/location/cities-by-region/${regionCode}`)
        .then(r => r.json()).then(setCities)
        .catch(err => console.error('Failed to fetch NCR cities:', err))
        .finally(() => setLoadingCities(false));
    } else {
      setLoadingProvinces(true);
      fetch(`/api/location/provinces/${regionCode}`)
        .then(r => r.json()).then(setProvinces)
        .catch(err => console.error('Failed to fetch provinces:', err))
        .finally(() => setLoadingProvinces(false));
    }
  }, [regionCode]);

  useEffect(() => {
    if (!provinceCode || isNCR) return;
    setLoadingCities(true);
    fetch(`/api/location/cities/${provinceCode}`)
      .then(r => r.json()).then(setCities)
      .catch(err => console.error('Failed to fetch cities:', err))
      .finally(() => setLoadingCities(false));
  }, [provinceCode]);

  useEffect(() => {
    if (!barangayField || !cityCode) { setBarangays([]); return; }
    setLoadingBarangays(true);
    fetch(`/api/location/barangays/${cityCode}`)
      .then(r => r.json()).then(setBarangays)
      .catch(err => console.error('Failed to fetch barangays:', err))
      .finally(() => setLoadingBarangays(false));
  }, [cityCode]);

  return (
    <>
      <div className="adm-info-card">
        <p className="adm-info-label">Region</p>
        <select
          className="adm-edit-input"
          value={regionCode}
          onChange={e => {
            updateDraft(regionField, e.target.value);
            updateDraft(provinceField, '');
            updateDraft(cityField, '');
            if (barangayField) updateDraft(barangayField, '');
          }}
        >
          <option value="">Select Region</option>
          {regions.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
        </select>
      </div>

      {!isNCR && (
        <div className="adm-info-card">
          <p className="adm-info-label">Province</p>
          <select
            className="adm-edit-input"
            value={provinceCode}
            disabled={!regionCode || loadingProvinces}
            onChange={e => {
              updateDraft(provinceField, e.target.value);
              updateDraft(cityField, '');
              if (barangayField) updateDraft(barangayField, '');
            }}
          >
            <option value="">
              {loadingProvinces ? 'Loading…' : !regionCode ? '- Select Region first -' : 'Select Province'}
            </option>
            {provinces.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </div>
      )}

      <div className="adm-info-card">
        <p className="adm-info-label">City / Municipality</p>
        <select
          className="adm-edit-input"
          value={cityCode}
          disabled={(!provinceCode && !isNCR) || loadingCities}
          onChange={e => {
            updateDraft(cityField, e.target.value);
            if (barangayField) updateDraft(barangayField, '');
          }}
        >
          <option value="">{loadingCities ? 'Loading…' : 'Select City / Municipality'}</option>
          {cities.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </div>

      {barangayField && (
        <div className="adm-info-card">
          <p className="adm-info-label">Barangay</p>
          <select
            className="adm-edit-input"
            value={barangayCode}
            disabled={!cityCode || loadingBarangays}
            onChange={e => updateDraft(barangayField, e.target.value)}
          >
            <option value="">
              {loadingBarangays ? 'Loading…' : !cityCode ? '- Select City first -' : 'Select Barangay'}
            </option>
            {barangays.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select>
        </div>
      )}
    </>
  );
}

// DocPreview sub-component
// => Streams a single R2 document via the admin proxy. Now also supports
//    Replace: a hidden file input swaps this document's file in place.
function DocPreview({ documentKey, documentType, docPublicId, onOpenModal, onReplace, replacing, onDelete, deleting, isOriginal = true }) {
  const [url,     setUrl]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!documentKey) return;

    let objectUrl = null;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const encodedKey = encodeURIComponent(documentKey);
        const res = await fetch(`/api/admin/enrollments/docs/${encodedKey}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to load file.');
        const blob = await res.blob();
        objectUrl  = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    load();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentKey]);

  const isPdf = documentKey?.toLowerCase().endsWith('.pdf');

  // => Unique input id per doc so the hidden file input + label pair don't collide
  const inputId = `replace-doc-${docPublicId}`;

  return (
    <div className="adm-tesda-doc-preview">
      <p className="adm-tesda-doc-type">{documentType}</p>

      {loading && (
        <div className="adm-tesda-doc-preview-state">
          <div className="adm-spinner adm-spinner--sm" />
          <span>Loading…</span>
        </div>
      )}

      {error && !loading && (
        <div className="adm-tesda-doc-preview-state adm-tesda-doc-preview-state--error">
          <span><img src={errorIcon} alt="Error" className="error-icon"/></span> {error}
        </div>
      )}

      {url && !loading && (
        <div
          className="adm-doc-clickable"
          onClick={() => onOpenModal({ url, documentType, isPdf })}
          title="Click to enlarge"
        >
          {isPdf ? (
            <iframe
              src={url}
              className="adm-doc-iframe adm-doc-iframe--thumb"
              title={documentType}
              style={{ pointerEvents: 'none' }}
            />
          ) : (
            <img
              src={url}
              alt={documentType}
              className="adm-doc-img"
            />
          )}
          <div className="adm-doc-enlarge-hint">
            <img src={searchIcon} alt="" className="search-icon" />
            Click to enlarge
          </div>
        </div>
      )}

      {/* => Replace control - hidden file input triggered by a visible label/button */}
      <div className="adm-tesda-doc-replace-row">
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) onReplace(docPublicId, file);
            e.target.value = ''; // => allow re-selecting the same file later
          }}
        />
        <label htmlFor={inputId} className="adm-tesda-doc-replace-btn">
          {replacing ? 'Uploading…' : 'Replace File'}
        </label>
        {/* => Original submissions can only be replaced, never deleted, for
             auditing - only admin-added documents get a delete button. */}
        {!isOriginal && (
          <button
            type="button"
            className="adm-doc-delete-btn"
            onClick={() => onDelete(docPublicId)}
            disabled={deleting}
            title="Delete this document"
          >
            <img src={trashIcon} alt="Delete" className="adm-pencil-icon" />
          </button>
        )}
      </div>
    </div>
  );
}

// 
// Main component
// 
export default function TESDAEnrollmentDetail() {
  const { publicId } = useParams();
  const navigate     = useNavigate();

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const [selectedStatus, setSelectedStatus] = useState('');
  // => Client-side pagination for the Activity Logs table - logs come
  //    bundled in the main detail fetch, not a separate endpoint, so
  //    paging is just slicing the already-loaded array
  const [logPage, setLogPage] = useState(1);

  const [nationalities, setNationalities] = useState([]);
  const [saving,         setSaving]         = useState(false);
  // => saveMsg state removed - status save feedback now goes through
  //    react-hot-toast instead of an inline banner

  const [internalRemarksDraft, setInternalRemarksDraft] = useState('');
  const [externalRemarksDraft, setExternalRemarksDraft] = useState('');
  const [savingInternalRemarks, setSavingInternalRemarks] = useState(false);

  // => External Remarks tracks the status dropdown: switching to a DIFFERENT
  //    status clears the draft (fresh note for that status), switching back
  //    to the currently-saved status restores whatever's in the DB. It only
  //    ever writes to the DB when Save Status is confirmed - see handleStatusConfirmed.
  useEffect(() => {
    const enr = data?.enrollment;
    if (!enr) return;
    if (selectedStatus === enr.status) {
      setExternalRemarksDraft(enr.external_remarks ?? '');
    } else {
      setExternalRemarksDraft('');
    }
  }, [selectedStatus, data?.enrollment?.status, data?.enrollment?.external_remarks]);

  const [modal, setModal] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // => Payment & Refund History - placeholder state for now, wired to a
  //    real fetch in Step 3 once the backend endpoint exists.
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [totalPaid, setTotalPaid] = useState(0);
  // => Total required to clear the For Assessment gate (course fee for
  //    Regular batches + batch misc fees), from the same endpoint
  const [totalRequired, setTotalRequired] = useState(0);

  // => TESDA Classes 
const [classOptions, setClassOptions] = useState([]);
const [loadingClassOptions, setLoadingClassOptions] = useState(false);

  const handleOpenModal  = (doc) => setModal(doc);
  const handleCloseModal = ()    => setModal(null);

  const [locationNames, setLocationNames] = useState({
    region: null, province: null, city: null, barangay: null,
  });

  const [birthplaceNames, setBirthplaceNames] = useState({
    region: null, province: null, city: null,
  });

  // 
  // EDIT MODE STATE
  // => Only one section editable at a time - editingSection holds that
  //    section's key ('enrollmentInfo' | 'ncae' | 'scholarship' |
  //    'classifications' | 'profile' | 'address' | 'guardian' | null).
  //    draft holds that section's in-progress field values.
  // 
  const [editingSection, setEditingSection] = useState(null);
  const [draft,          setDraft]          = useState({});
  const [sectionSaving,  setSectionSaving]  = useState(false);
  const [sectionError,   setSectionError]   = useState(null);

  // => Per-document replace-in-flight tracking, keyed by doc public_id
  const [replacingDocId, setReplacingDocId] = useState(null);
  const [docError, setDocError] = useState(null);

  // => Add Document form state
  const [addDocType, setAddDocType] = useState('');
  const [addDocFile, setAddDocFile] = useState(null);
  const [addingDoc,  setAddingDoc]  = useState(false);
  // => Bumped after a successful add to remount the file input, clearing
  //    its display - mirrors shsEnrollmentDetail.jsx's same pattern
  const [addDocInputKey, setAddDocInputKey] = useState(0);

  // => Delete Document 
  const [deletingDocId, setDeletingDocId] = useState(null);
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

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

  // => Generic PATCH helper - returns the parsed response body on success,
  //    sets sectionError and re-throws on failure so callers can bail early
  const patchSection = async (endpointPath, payload) => {
    setSectionSaving(true);
    setSectionError(null);
    try {
      const res = await axiosAdmin.patch(
        `/api/admin/enrollments/tesda/${publicId}/${endpointPath}`,
        payload
      );
      return res.data;
    } catch (err) {
      setSectionError(err.response?.data?.error || 'Failed to save changes.');
      throw err;
    } finally {
      setSectionSaving(false);
    }
  };

  // TESDA Classes 
  useEffect(() => {
    if (editingSection !== 'classAssign') return;
    const enr = data?.enrollment;
    if (!enr?.course_id) { setClassOptions([]); return; }

    setLoadingClassOptions(true);
    const params = new URLSearchParams({ course_id: enr.course_id });

    fetch(`/api/admin/enrollments/tesda/classes/available?${params.toString()}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setClassOptions(d.classes || []))
      .catch(err => console.error('Failed to fetch available classes:', err))
      .finally(() => setLoadingClassOptions(false));
  }, [editingSection, data?.enrollment?.course_id]);

  //  Fetch full enrollment detail on mount 
  useEffect(() => {
    if (!publicId) return;

    const fetchDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/enrollments/tesda/${publicId}`, {
          credentials: 'include',
        });
        if (res.status === 404) throw new Error('Enrollment not found.');
        if (!res.ok) throw new Error('Failed to fetch enrollment detail.');
        const json = await res.json();
        setData(json);
        setSelectedStatus(json.enrollment.status);
        setInternalRemarksDraft(json.enrollment.internal_remarks ?? '');
        setExternalRemarksDraft(json.enrollment.external_remarks ?? '');
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [publicId]);

  // => Payment History - separate fetch from the main enrollment detail
  //    since it hits a different endpoint. Doesn't block the page's main
  //    loading state - failing silently here just leaves the section at
  //    its default empty/0 values instead of erroring the whole page.
  useEffect(() => {
    if (!publicId) return;

    const fetchPaymentHistory = async () => {
      try {
        const res = await fetch(`/api/admin/enrollments/tesda/${publicId}/payment-history`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const json = await res.json();
        setPaymentHistory(json.records ?? []);
        setTotalPaid(json.totalPaid ?? 0);
        setTotalRequired(json.totalRequired ?? 0);
      } catch (err) {
        console.error('Failed to fetch payment history:', err);
      }
    };

    fetchPaymentHistory();
  }, [publicId]);

  // => Resolve address codes to human-readable names
  useEffect(() => {
    if (!data?.address) return;

    const addr = data.address;

    const resolve = async () => {
      const names = { region: null, province: null, city: null, barangay: null };

      try {
        if (addr.region_code) {
          const res = await fetch('/api/location/regions');
          if (res.ok) {
            const regions = await res.json();
            const match = regions.find(r =>
              addr.region_code === r.code ||
              addr.region_code.startsWith(r.code) ||
              r.code.startsWith(addr.region_code)
            );
            names.region = match?.name ?? addr.region_code;
          }
        }

        if (addr.province_code) {
          const res = await fetch(`/api/location/provinces/${addr.region_code}`);
          if (res.ok) {
            const provinces = await res.json();
            const match = provinces.find(p => p.code === addr.province_code);
            names.province = match?.name ?? addr.province_code;
          }
        }

        if (addr.city_code) {
          const endpoint = addr.province_code
            ? `/api/location/cities/${addr.province_code}`
            : `/api/location/cities-by-region/${addr.region_code}`;
          const res = await fetch(endpoint);
          if (res.ok) {
            const cities = await res.json();
            const match = cities.find(c => c.code === addr.city_code);
            names.city = match?.name ?? addr.city_code;
          }
        }

        if (addr.barangay_code && addr.city_code) {
          const res = await fetch(`/api/location/barangays/${addr.city_code}`);
          if (res.ok) {
            const barangays = await res.json();
            const match = barangays.find(b => b.code === addr.barangay_code);
            names.barangay = match?.name ?? addr.barangay_code;
          }
        }

        setLocationNames(names);
      } catch (err) {
        console.error('Failed to resolve address location names:', err);
      }
    };

    resolve();
  }, [data]);

  // => Resolve birthplace codes to readable names
  useEffect(() => {
    if (!data?.profile) return;

    const p = data.profile;
    if (!p.birthplace_region && !p.birthplace_province && !p.birthplace_city) return;

    const resolve = async () => {
      const names = { region: null, province: null, city: null };

      try {
        if (p.birthplace_region) {
          const res = await fetch('/api/location/regions');
          if (res.ok) {
            const regions = await res.json();
            const match = regions.find(r =>
              p.birthplace_region === r.code ||
              p.birthplace_region.startsWith(r.code) ||
              r.code.startsWith(p.birthplace_region)
            );
            names.region = match?.name ?? p.birthplace_region;
          }
        }

        if (p.birthplace_province && p.birthplace_region) {
          const res = await fetch(`/api/location/provinces/${p.birthplace_region}`);
          if (res.ok) {
            const provinces = await res.json();
            const match = provinces.find(pr => pr.code === p.birthplace_province);
            names.province = match?.name ?? p.birthplace_province;
          }
        }

        if (p.birthplace_city) {
          const endpoint = p.birthplace_province
            ? `/api/location/cities/${p.birthplace_province}`
            : `/api/location/cities-by-region/${p.birthplace_region}`;
          const res = await fetch(endpoint);
          if (res.ok) {
            const cities = await res.json();
            const match = cities.find(c => c.code === p.birthplace_city);
            names.city = match?.name ?? p.birthplace_city;
          }
        }

        setBirthplaceNames(names);
      } catch (err) {
        console.error('Failed to resolve birthplace names:', err);
      }
    };

    resolve();
  }, [data]);

  // => Re-fetches the full detail bundle without touching the page's
  //    loading/error state - used after actions that write server-side
  //    data (status changes) so sections like Activity Logs reflect the
  //    change immediately instead of needing a manual page reload
  const refreshDetail = async () => {
    try {
      const res = await fetch(`/api/admin/enrollments/tesda/${publicId}`, {
        credentials: 'include',
      });
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to refresh enrollment detail:', err);
    }
  };

  //  Status update handler 
  // => Switched from raw fetch to axiosAdmin so x-csrf-token is actually
  //    attached - the previous raw fetch call had no CSRF header at all.
  const handleStatusSave = () => {
    if (!selectedStatus || selectedStatus === data?.enrollment?.status) return;
    // => Needs Clarification is shown to the student on their dashboard -
    //    block here so the admin sees this before opening the confirm
    //    modal, not just after hitting a 400 from the backend gate
    if (selectedStatus === 'Needs Clarification' && !externalRemarksDraft.trim()) {
      toast.error('External Remarks is required when setting status to "Needs Clarification".');
      return;
    }
    // => For Assessment requires the batch's training period to have
    //    actually ended - today must be on or after end_date. Blocked
    //    here so the admin sees this before opening the confirm modal,
    //    not just after hitting a 400 from the backend gate.
    if (selectedStatus === 'For Assessment' && !isBatchTrainingEnded(enrollment.end_date)) {
      toast.error(
        enrollment.end_date
          ? `Cannot set status to "For Assessment": the batch's training period hasn't ended yet (ends ${formatDate(enrollment.end_date)}).`
          : 'Cannot set status to "For Assessment": this batch has no end date set, so the training period cannot be confirmed as finished.'
      );
      return;
    }
    setConfirmOpen(true);
  };

  const handleStatusConfirmed = async () => {
    setConfirmOpen(false);
    setSaving(true);
    try {
      await axiosAdmin.patch(`/api/admin/enrollments/tesda/${publicId}/status`, {
        status: selectedStatus,
        external_remarks: externalRemarksDraft,
      });
      // => Pulls the fresh detail bundle - including the Activity Logs
      //    row the backend just wrote - instead of a manual local patch,
      //    so the log table updates immediately without a page reload
      await refreshDetail();
      toast.success(`Status updated to "${selectedStatus}".`);
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to update status.';
      // => Batch-at-capacity rejection gets an actionable toast instead of
      //    a plain error - links straight to the batch detail page so the
      //    admin can Release Overflow or reassign the student without
      //    having to hunt down which batch this even is
      if (errorMsg.includes('already full') && enrollment.batch_public_id) {
        toast.error((t) => (
          <span>
            {errorMsg}
            {' '}
            <button
              onClick={() => {
                toast.dismiss(t.id);
                navigate(`/dashboard/classes/tesda/${enrollment.batch_public_id}`);
              }}
              style={{
                marginLeft: 6,
                background: 'none',
                border: 'none',
                color: '#1a56db',
                textDecoration: 'underline',
                cursor: 'pointer',
                fontWeight: 600,
                padding: 0,
                font: 'inherit',
              }}
            >
              Go to Batch →
            </button>
          </span>
        ), { duration: 8000 });
      } else {
        toast.error(errorMsg);
      }
    } finally {
      setSaving(false);
    }
  };

  // 
  // SECTION SAVE HANDLERS
  // => Each hits the same generic patchSection helper, then merges the
  //    response back into `data` by SPREADING over the existing object -
  //    the enrollment PATCH returns RETURNING * (raw columns only), which
  //    does NOT include joined display fields like course_name/
  //    sector/student_username/class period. Spreading preserves those
  //    instead of wiping them out.
  // 

  // => Fetch nationalities for the profile
    useEffect(() => {
      fetch('/api/reference/nationalities')
        .then(r => r.json())
        .then(setNationalities)
        .catch(err => console.error('Failed to fetch nationalities:', err));
    }, []);

  const handleSaveEnrollmentInfo = async () => {
    try {
      await patchSection('enrollment', {
        uli: draft.uli,
      });
      // => Full refetch instead of local merge - picks up the new
      //    Activity Logs row immediately, same pattern as status changes
      await refreshDetail();
      cancelEdit();
    } catch { /* sectionError already set */ }
  };

  const handleSaveInternalRemarks = async () => {
    setSavingInternalRemarks(true);
    try {
      await patchSection('enrollment', { internal_remarks: internalRemarksDraft });
      await refreshDetail();
    } catch { /* sectionError already set by patchSection */ }
    finally { setSavingInternalRemarks(false); }
  };

  const handleSaveNcae = async () => {
    // => Mirrors TESDAStep4's rule: Where/When become required once Taken = Yes.
    if (draft.ncae_taken && (!draft.ncae_where.trim() || !draft.ncae_when.trim())) {
      setSectionError('Where Taken and When Taken are required when NCAE Taken is Yes.');
      return;
    }
    try {
      await patchSection('enrollment', {
        ncae_taken: draft.ncae_taken,
        ncae_where: draft.ncae_where,
        ncae_when: draft.ncae_when,
      });
      await refreshDetail();
      cancelEdit();
    } catch { /* sectionError already set */ }
  };

  const handleSaveScholarship = async () => {
    if (draft.is_tesda_scholar && !draft.scholarship_type.trim()) {
      setSectionError('Scholarship Type is required when TESDA Scholar is Yes.');
      return;
    }
    if (draft.scholarship_type === 'Others' && !draft.other_scholarship.trim()) {
      setSectionError('Please specify the scholarship under Other Scholarship.');
      return;
    }
    try {
      await patchSection('enrollment', {
        is_tesda_scholar: draft.is_tesda_scholar,
        scholarship_type: draft.scholarship_type,
        other_scholarship: draft.other_scholarship,
      });
      await refreshDetail();
      cancelEdit();
    } catch { /* sectionError already set */ }
  };

  const handleSaveClassifications = async () => {
    try {
      await patchSection('classifications', {
        classifications: draft.classification ? [draft.classification] : [],
        othersText: draft.othersText || '',
      });
      await refreshDetail();
      cancelEdit();
    } catch { /* sectionError already set */ }
  };

  const handleSaveProfile = async () => {
    const ageError = validateAge(draft.birth_date);
    const emailError = validateEmailFormat(draft.email);
    if (ageError || emailError) {
      setFieldErrors(prev => ({ ...prev, birth_date: ageError, email: emailError }));
      setSectionError('Please fix the highlighted fields before saving.');
      return;
    }
    if (Object.values(fieldErrors).some(Boolean)) {
      setSectionError('Please fix the highlighted fields before saving.');
      return;
    }
    try {
      await patchSection('profile', draft);
      await refreshDetail();
      cancelEdit();
    } catch { /* sectionError already set */ }
  };

  const handleSaveAddress = async () => {
    try {
      await patchSection('address', draft);
      await refreshDetail();
      cancelEdit();
    } catch { /* sectionError already set */ }
  };

  const handleSaveGuardian = async () => {
    try {
      await patchSection('guardian', draft);
      await refreshDetail();
      cancelEdit();
    } catch { /* sectionError already set */ }
  };


  const handleSaveClassAssign = async () => {
    try {
      await patchSection('enrollment', { batch_id: draft.batch_id || null });
      // => Swapped fetchDetail() for refreshDetail() - same data, but skips
      //    setLoading(true), so this stays consistent with every other
      //    section save instead of flashing the whole page into the spinner
      await refreshDetail();
      cancelEdit();
    } catch { /* sectionError already set */ }
  };

  // 
  // DOCUMENT HANDLERS - Replace + Add
  // 
  const handleReplaceDoc = async (docPublicId, file) => {
    setReplacingDocId(docPublicId);
    setDocError(null);
    try {
      const formData = new FormData();
      formData.append('document', file);
      const res = await axiosAdmin.patch(
        `/api/admin/enrollments/tesda/${publicId}/docs/${docPublicId}`,
        formData,
        { headers: { 'Content-Type': undefined } } // => lets the browser set the multipart boundary itself, to upload new files
      );
      await refreshDetail();
    } catch (err) {
      setDocError(err.response?.data?.error || 'Failed to replace document.');
    } finally {
      setReplacingDocId(null);
    }
  };

  const handleDeleteDoc = async (docPublicId) => {
    setDeletingDocId(docPublicId);
    setDocError(null);
    try {
      await axiosAdmin.delete(`/api/admin/enrollments/tesda/${publicId}/docs/${docPublicId}`);
      await refreshDetail();
    } catch (err) {
      setDocError(err.response?.data?.error || 'Failed to delete document.');
    } finally {
      setDeletingDocId(null);
      setDeleteConfirmDoc(null);
    }
  };

  const handleAddDoc = async () => {
    if (!addDocType.trim() || !addDocFile) {
      setDocError('Document type and file are both required.');
      return;
    }
    setAddingDoc(true);
    setDocError(null);
    try {
      const formData = new FormData();
      formData.append('document', addDocFile);
      formData.append('documentType', addDocType.trim());
      await axiosAdmin.post(
        `/api/admin/enrollments/tesda/${publicId}/docs`,
        formData,
        { headers: { 'Content-Type': undefined } }
      );
      await refreshDetail();
      setAddDocType('');
      setAddDocFile(null);
      setAddDocInputKey(k => k + 1); // => forces the file input to remount, clearing its display
    } catch (err) {
      setDocError(err.response?.data?.error || 'Failed to add document.');
    } finally {
      setAddingDoc(false);
    }
  };

  //  Convenience destructure 
  const enrollment      = data?.enrollment   ?? {};
  const profile         = data?.profile      ?? {};
  const guardian         = data?.guardian      ?? null;
  const docs             = data?.docs          ?? [];
  const address           = data?.address       ?? null;
  const classifications = data?.classifications ?? [];
  const logs = data?.logs ?? [];

  // => Column defs handed to LogComponent, matches this page's existing
  //    Date/Actor/Action/Details layout and field names
  const logColumns = [
    { key: 'date', header: 'Date', render: (log) => formatDateTime(log.created_at) },
    { key: 'actor', header: 'Actor', render: (log) => log.performed_by_name ?? 'System' },
    { key: 'action', header: 'Action', render: (log) => log.action },
    {
      key: 'details',
      header: 'Details',
      cellClassName: 'logc-log-detail-cell',
      render: (log) => log.remarks || '-',
    },
  ];

  const feeDisplay = enrollment.is_tesda_scholar
    ? 'Free (TESDA Scholar)'
    : formatCurrency(enrollment.fee_at_enrollment);

  // => Based on batch_id now, not start_date - a batch can be assigned
  // => with no dates set yet, which used to wrongly show "Not yet assigned"
  const classPeriodDisplay = !enrollment.batch_id
    ? 'Not yet assigned'
    : !enrollment.start_date
      ? `${enrollment.batch_name} (dates TBA)`
      : !enrollment.end_date
        ? `${enrollment.batch_name} - ${formatDate(enrollment.start_date)} - Ongoing`
        : `${enrollment.batch_name} - ${formatDate(enrollment.start_date)} - ${formatDate(enrollment.end_date)}`;

  // => The batch name itself is the clickable link to the batch detail
  //    page - dates stay as plain text right after it. Falls back to
  //    plain text if batch_public_id isn't present for some reason.
  const classPeriodSuffix = !enrollment.batch_id
    ? ''
    : !enrollment.start_date
      ? ' (dates TBA)'
      : !enrollment.end_date
        ? ` - ${formatDate(enrollment.start_date)} - Ongoing`
        : ` - ${formatDate(enrollment.start_date)} - ${formatDate(enrollment.end_date)}`;

  const classPeriodValue = enrollment.batch_id && enrollment.batch_public_id ? (
    <>
      <Link to={`/dashboard/classes/tesda/${enrollment.batch_public_id}`} className="adm-view-batch-link">
        {enrollment.batch_name}
      </Link>
      {classPeriodSuffix}
    </>
  ) : classPeriodDisplay;

  const selectedClassifications = classifications.map(c => c.classification_value);
  const othersRow = classifications.find(c => c.classification_value === 'others');

  return (
    <div className="adm-tesda-enrollment-detail-page">

      <BackButton destination="Enrollments" onClick={() => navigate('/dashboard/enrollments')} />

      {/* => Swapped local adm-detail-state spinner/warning markup for the
           shared LoadingState component, same variant pattern used elsewhere */}
      {loading && (
        <LoadingState message="Loading enrollment detail…" />
      )}

      {!loading && error && (
        <LoadingState variant="error" message={error} />
      )}

      {!loading && !error && data && (
        <div className="adm-detail-body">

          {/* ════════════════════════════════════
              HEADER: course + student name + status badge
              ════════════════════════════════════ */}
          <div className="adm-detail-hero">
            <div className="adm-hero-left">
              <p className="adm-hero-course">{enrollment.course_name || '-'}</p>
              <h2 className="adm-hero-name">{fullName(profile)}</h2>
              <p className="adm-hero-email">{enrollment.student_username}</p>
            </div>
            {/* => Type badge sits left of status, since this component is
                 always TESDA - hardcoded rather than read from data */}
            <div className="adm-hero-badges">
              <span className="adm-hero-type-badge adm-hero-type-badge--tesda">TESDA</span>
              <span className={`adm-hero-badge ${statusClass[enrollment.status] || ''}`}>
                {enrollment.status}
              </span>
              {/* => Balance badge for the For Assessment gate - course fee
                   (Regular TESDA only) + batch misc fees. Moved here from
                   Update Status so it reads alongside the other tags
                   instead of crowding the status controls. */}
              <span className={`adm-hero-balance-badge ${totalPaid >= totalRequired ? 'adm-hero-balance-badge--paid' : 'adm-hero-balance-badge--unpaid'}`}>
                {totalRequired <= 0
                  ? 'No Balance Due'
                  : totalPaid >= totalRequired
                  ? 'Balance Cleared'
                  : `₱${(totalRequired - totalPaid).toFixed(2)} Due`}
              </span>
            </div>
          </div>

          {/* ════════════════════════════════════
              STATUS CHANGER
              ════════════════════════════════════ */}
          <section className="adm-tesda-section">
            <h3 className="adm-tesda-section-title">Update Status</h3>
            <div className="adm-status-changer">
              <select
                className="adm-status-select"
                value={selectedStatus}
                onChange={e => {
                  setSelectedStatus(e.target.value);
                }}
              >
                {STATUS_OPTIONS.map(s => (
                  // => Sequencing/prereq gates mirrored from
                  //    tesdaEnrollmentService.js, disabled here so the admin
                  //    sees it's unavailable before hitting a 400. Each stays
                  //    enabled if it's already the current status, so
                  //    re-saving isn't blocked. Note: balance clearing for
                  //    "For Assessment" isn't checked client-side here since
                  //    payment totals aren't loaded into this component -
                  //    that gate only surfaces via the backend error toast.
                  <option
                    key={s}
                    value={s}
                    disabled={
                      (s === 'Reserved' && enrollment.batch_id) ||
                      (s === 'Approved' && enrollment.status !== 'Reviewed' && enrollment.status !== 'Approved') ||
                      (s === 'For Assessment' && (
                        (enrollment.status !== 'Approved' && enrollment.status !== 'For Assessment') ||
                        !enrollment.batch_id ||
                        !isBatchTrainingEnded(enrollment.end_date) ||
                        totalPaid < totalRequired
                      )) ||
                      (s === 'Passed Assessment' && enrollment.status !== 'For Assessment' && enrollment.status !== 'Passed Assessment') ||
                      (s === 'Failed Assessment' && enrollment.status !== 'For Assessment' && enrollment.status !== 'Failed Assessment')
                    }
                  >
                    {s}
                  </option>
                ))}
              </select>

              <button
                className="adm-status-btn"
                onClick={handleStatusSave}
                disabled={
                  saving ||
                  selectedStatus === enrollment.status ||
                  (selectedStatus === 'Needs Clarification' && !externalRemarksDraft.trim())
                }
              >
                {saving ? 'Saving…' : 'Save Status'}
              </button>

              {/* => Meaning of whichever status is currently selected. Falls
                   back to condition-specific notes for Reserved-without-batch
                   and Approved-without-Reviewed, since STATUS_DESCRIPTIONS
                   doesn't know about either condition */}
              <span className="adm-status-description">
                {selectedStatus === 'Reserved' && enrollment.batch_id
                  ? 'This enrollment already has a batch assigned, so it cannot be set to Reserved.'
                  : selectedStatus === 'Approved' && enrollment.status !== 'Reviewed' && enrollment.status !== 'Approved'
                  ? 'Enrollment must be in "Reviewed" status before it can be Approved.'
                  : selectedStatus === 'For Assessment' && enrollment.status !== 'Approved' && enrollment.status !== 'For Assessment'
                  ? 'Enrollment must be Approved before it can be set to "For Assessment".'
                  : selectedStatus === 'For Assessment' && !enrollment.batch_id
                  ? 'A batch must be assigned before this enrollment can be set to "For Assessment".'
                  : selectedStatus === 'For Assessment' && !isBatchTrainingEnded(enrollment.end_date)
                  ? (enrollment.end_date
                      ? `Batch training must end before this can be set to "For Assessment" (ends ${formatDate(enrollment.end_date)}).`
                      : 'This batch has no end date set - training completion cannot be confirmed for "For Assessment".')
                  : selectedStatus === 'For Assessment' && totalPaid < totalRequired
                  ? 'Balance must be fully cleared before this enrollment can be set to "For Assessment".'
                  : selectedStatus === 'Failed Assessment' && enrollment.status !== 'For Assessment' && enrollment.status !== 'Failed Assessment'
                  ? 'Enrollment must be in "For Assessment" status before it can be set to "Failed Assessment".'
                  : STATUS_DESCRIPTIONS[selectedStatus]}
              </span>

              {/* => External Remarks: no Save button - only persists when
                   Save Status is confirmed (see the useEffect that clears/
                   restores this on status change). Moved next to the status
                   meaning to match SHSEnrollmentDetail's layout. */}
              <div className="adm-tesda-remarks-group adm-tesda-remarks-group--external">
                <div className="adm-tesda-remarks-header">
                <label className="adm-tesda-remarks-label adm-tesda-remarks-label--external" htmlFor="tesda-external-remarks">
                  External Remarks
                  {/* => Only shown when the rule actually applies, so the
                       label doesn't nag on every other status */}
                  {selectedStatus === 'Needs Clarification' && (
                    <span className="adm-remarks-required"> (required)</span>
                  )}
                </label>
                </div>
                <textarea
                  id="tesda-external-remarks"
                  className="adm-tesda-remarks-input adm-tesda-remarks-input--external"
                  placeholder="Note shown to the student when this status is saved…"
                  value={externalRemarksDraft}
                  onChange={e => setExternalRemarksDraft(e.target.value)}
                />
              </div>

              {/* => Internal Remarks: staff-only note, own Save button, not tied to status */}
              <div className="adm-tesda-remarks-group adm-tesda-remarks-group--internal">
                <div className="adm-tesda-remarks-header">
                  <label className="adm-tesda-remarks-label adm-tesda-remarks-label--internal" htmlFor="tesda-internal-remarks">
                    Internal Remarks
                  </label>
                  <button
                    className="adm-tesda-remarks-save-btn adm-tesda-remarks-save-btn--internal"
                    onClick={handleSaveInternalRemarks}
                    disabled={savingInternalRemarks}
                  >
                    {savingInternalRemarks ? 'Saving…' : 'Save'}
                  </button>
                </div>
                <textarea
                  id="tesda-internal-remarks"
                  className="adm-tesda-remarks-input adm-tesda-remarks-input--internal"
                  placeholder="Staff-only note (not visible to the student)…"
                  value={internalRemarksDraft}
                  onChange={e => setInternalRemarksDraft(e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* ════════════════════════════════════
              ENROLLMENT INFORMATION
              => Course/Sector/Date Submitted stay read-only - they're
                 derived from joins (course_id/batch_id) and need
                 a proper picker UI, deferred per earlier project decision.
                 ULI and Fee are direct columns and fully editable.
              ════════════════════════════════════ */}
          <section className="adm-tesda-section">
            <div className="adm-tesda-section-header-row">
              <h3 className="adm-tesda-section-title">Enrollment Information</h3>
              <SectionEditControls
                sectionKey="enrollmentInfo"
                editingSection={editingSection}
                saving={sectionSaving}
                onEdit={() => startEdit('enrollmentInfo', {
                  uli: enrollment.uli ?? '',
                })}
                onSave={handleSaveEnrollmentInfo}
                onCancel={cancelEdit}
              />
            </div>
            {editingSection === 'enrollmentInfo' && sectionError && (
              <p className="adm-tesda-section-error">{sectionError}</p>
            )}
            <div className="adm-info-grid">
              {editingSection === 'enrollmentInfo' ? (
                <>
                  <EditableField label="ULI" value={draft.uli} onChange={v => updateDraft('uli', v)} />
                  {/* => Locked - fee_at_enrollment is frozen at submit time per
                       server.js's own comment, never updated after. */}
                  <InfoCard label="Fee at Enrollment" value={feeDisplay} copyable={false} />
                </>
              ) : (
                <>
                  <InfoCard label="ULI" value={enrollment.uli || '-'} />
                  <InfoCard label="Fee at Enrollment" value={feeDisplay} copyable={true} />
                </>
              )}
              <InfoCard label="Course" value={enrollment.course_name || '-'} />
              <InfoCard label="Sector" value={enrollment.sector || '-'} />
              <InfoCard label="Date Submitted" value={formatDate(enrollment.submitted_at)} />
            </div>
          </section>

          {/* ════════════════════════════════════
              PAYMENT & REFUND HISTORY (read-only)
              ════════════════════════════════════ */}
          <section className="adm-tesda-section">
            <h3 className="adm-tesda-section-title">
              Payment History
              <span className="adm-tesda-section-count-inline">{paymentHistory.length}</span>
            </h3>

            {/* => Reservation fee must be paid in full before this enrollment
                 can be Approved - enforced on the backend regardless, this is
                 just a visible heads-up for staff reviewing the record. */}
            <p className={`adm-reservation-note ${totalPaid >= 1000 ? 'adm-reservation-note--paid' : 'adm-reservation-note--unpaid'}`}>
              Reservation Fee (₱1,000.00): {totalPaid >= 1000
                ? 'Paid in full'
                : `₱${(1000 - totalPaid).toFixed(2)} remaining`}
            </p>

            {paymentHistory.length === 0 ? (
              <p className="adm-empty-note">No payments or refunds recorded yet.</p>
            ) : (
              <div className="adm-sub-table-wrap">
                <table className="adm-sub-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Reference #</th>
                      <th>Amount</th>
                      <th>Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentHistory.map(record => (
                      <tr
                        key={record.public_id}
                        className="adm-sub-table-row"
                        onClick={() => navigate(
                          record.record_type === 'Payment'
                            ? `/dashboard/payments/${record.public_id}`
                            : `/dashboard/refunds/${record.public_id}`
                        )}
                        title={`View ${record.record_type.toLowerCase()} detail`}
                      >
                        <td>
                          <span className={`adm-type-badge adm-type-badge--${record.record_type.toLowerCase()}`}>
                            {record.record_type}
                          </span>
                        </td>
                        <td className="adm-td-or-number">{record.reference_number}</td>
                        <td>{formatCurrency(record.amount)}</td>
                        <td className="adm-td-date">{formatDate(record.record_date)}</td>
                        <td>
                          <span className={`adm-badge adm-badge--payment-${record.status.toLowerCase()}`}>
                            {record.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ════════════════════════════════════
              CLASS / BATCH
              => Read-only: comes from the joined tesda_classes row, not
                 tesda_enrollments directly. Reassignment deferred.
              ════════════════════════════════════ */}
          <section className="adm-tesda-section">
            <div className="adm-tesda-section-header-row">
              <h3 className="adm-tesda-section-title">Class / Batch</h3>
              <SectionEditControls
                sectionKey="classAssign"
                editingSection={editingSection}
                saving={sectionSaving}
                onEdit={() => startEdit('classAssign', { batch_id: enrollment.batch_id ?? '' })}
                onSave={handleSaveClassAssign}
                onCancel={cancelEdit}
              />
            </div>
            {editingSection === 'classAssign' && sectionError && (
              <p className="adm-tesda-section-error">{sectionError}</p>
            )}
            {editingSection === 'classAssign' ? (
              <div className="adm-info-grid">
                <div className="adm-info-card">
                  <p className="adm-info-label">Assign to Class</p>
                  <select
                    className="adm-edit-input"
                    value={draft.batch_id ?? ''}
                    disabled={loadingClassOptions}
                    onChange={e => updateDraft('batch_id', e.target.value)}
                  >
                    <option value="">
                      {loadingClassOptions
                        ? 'Loading…'
                        : classOptions.length === 0
                          ? 'No open classes for this course - leave unassigned'
                          : 'Select a class'}
                    </option>
                    {classOptions.map(c => (
                      <option key={c.batch_id} value={c.batch_id}>
                        {c.batch_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="adm-info-grid adm-info-grid--halves">
                <InfoCard label="Class Period" value={classPeriodValue} copyable={false} />
                <InfoCard label="Groupchat Link" value={enrollment.groupchat_link || '-'} />
              </div>
            )}
          </section>

          {/* ════════════════════════════════════
              NCAE
              ════════════════════════════════════ */}
          <section className="adm-tesda-section">
            <div className="adm-tesda-section-header-row">
              <h3 className="adm-tesda-section-title">NCAE</h3>
              <SectionEditControls
                sectionKey="ncae"
                editingSection={editingSection}
                saving={sectionSaving}
                onEdit={() => startEdit('ncae', {
                  ncae_taken: !!enrollment.ncae_taken,
                  ncae_where: enrollment.ncae_where ?? '',
                  ncae_when: enrollment.ncae_when ?? '',
                })}
                onSave={handleSaveNcae}
                onCancel={cancelEdit}
              />
            </div>
            {editingSection === 'ncae' && sectionError && (
              <p className="adm-tesda-section-error">{sectionError}</p>
            )}
            <div className="adm-info-grid">
              {editingSection === 'ncae' ? (
                <>
                  <EditableField
                    label="NCAE Taken"
                    type="yesno"
                    value={draft.ncae_taken}
                    required
                    onChange={v => {
                      updateDraft('ncae_taken', v);
                      // => Switching to No clears Where/When so stale data
                      //    can't linger under a "No" answer.
                      if (!v) {
                        updateDraft('ncae_where', '');
                        updateDraft('ncae_when', '');
                      }
                    }}
                  />
                  <EditableField label="Where Taken" value={draft.ncae_where} onChange={v => updateDraft('ncae_where', v)} disabled={!draft.ncae_taken} />
                  <EditableField label="When Taken" value={draft.ncae_when} onChange={v => updateDraft('ncae_when', v)} disabled={!draft.ncae_taken} />
                </>
              ) : (
                <>
                  <InfoCard label="NCAE Taken" value={enrollment.ncae_taken ? 'Yes' : 'No'} copyable={false} />
                  <InfoCard label="Where Taken" value={enrollment.ncae_where || '-'} />
                  <InfoCard label="When Taken"  value={enrollment.ncae_when || '-'} />
                </>
              )}
            </div>
          </section>

          {/* ════════════════════════════════════
              SCHOLARSHIP
              ════════════════════════════════════ */}
          <section className="adm-tesda-section">
            <div className="adm-tesda-section-header-row">
              <h3 className="adm-tesda-section-title">Scholarship</h3>
              <SectionEditControls
                sectionKey="scholarship"
                editingSection={editingSection}
                saving={sectionSaving}
                onEdit={() => startEdit('scholarship', {
                  is_tesda_scholar: !!enrollment.is_tesda_scholar,
                  scholarship_type: enrollment.scholarship_type ?? '',
                  other_scholarship: enrollment.other_scholarship ?? '',
                })}
                onSave={handleSaveScholarship}
                onCancel={cancelEdit}
              />
            </div>
            {editingSection === 'scholarship' && sectionError && (
              <p className="adm-tesda-section-error">{sectionError}</p>
            )}
            <div className="adm-info-grid">
              {editingSection === 'scholarship' ? (
                <>
                  <EditableField
                    label="TESDA Scholar"
                    type="yesno"
                    value={draft.is_tesda_scholar}
                    required
                    onChange={v => {
                      updateDraft('is_tesda_scholar', v);
                      // => Switching to No clears Type/Other so stale data
                      //    can't linger under a "No" answer.
                      if (!v) {
                        updateDraft('scholarship_type', '');
                        updateDraft('other_scholarship', '');
                      }
                    }}
                  />
                  <EditableField label="Scholarship Type" value={draft.scholarship_type} onChange={v => updateDraft('scholarship_type', v)} disabled={!draft.is_tesda_scholar} />
                  <EditableField label="Other Scholarship" value={draft.other_scholarship} onChange={v => updateDraft('other_scholarship', v)} disabled={!draft.is_tesda_scholar} />
                </>
              ) : (
                <>
                  <InfoCard label="TESDA Scholar" value={enrollment.is_tesda_scholar ? 'Yes' : 'No'} copyable={false} />
                  <InfoCard label="Scholarship Type" value={enrollment.scholarship_type || '-'} />
                  <InfoCard label="Other Scholarship" value={enrollment.other_scholarship || '-'} />
                </>
              )}
            </div>
          </section>

          {/* ════════════════════════════════════
              CLIENT CLASSIFICATIONS
              ════════════════════════════════════ */}
          <section className="adm-tesda-section">
            <div className="adm-tesda-section-header-row">
              <h3 className="adm-tesda-section-title">
                Client Classifications
              </h3>
              <SectionEditControls
                sectionKey="classifications"
                editingSection={editingSection}
                saving={sectionSaving}
                onEdit={() => startEdit('classifications', {
                  classification: selectedClassifications[0] ?? '',
                  othersText: othersRow?.others_text ?? '',
                })}
                onSave={handleSaveClassifications}
                onCancel={cancelEdit}
              />
            </div>
            {editingSection === 'classifications' && sectionError && (
              <p className="adm-tesda-section-error">{sectionError}</p>
            )}

            {editingSection === 'classifications' ? (
              <div className="adm-checkbox-list">
                {CLASSIFICATIONS.map(({ value, label }) => (
                  <label key={value} className="adm-checkbox-item">
                    <input
                      type="radio"
                      name="tesda-classification"
                      checked={draft.classification === value}
                      onChange={() => updateDraft('classification', value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
                {draft.classification === 'others' && (
                  <input
                    className="adm-edit-input"
                    style={{ marginTop: '8px' }}
                    placeholder="Specify others…"
                    value={draft.othersText ?? ''}
                    onChange={e => updateDraft('othersText', e.target.value)}
                  />
                )}
              </div>
            ) : classifications.length === 0 ? (
              <p className="adm-empty-note">No classifications on file.</p>
            ) : (
              <div className="adm-info-grid">
                {classifications.map((c, i) => (
                  <InfoCard
                    key={c.classification_id ?? i}
                    label="Classification"
                    value={c.classification_value === 'others' ? (c.others_text || 'Others') : (CLASSIFICATION_LABELS[c.classification_value] ?? c.classification_value)}
                    copyable={true}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ════════════════════════════════════
              STUDENT PROFILE
              ════════════════════════════════════ */}
          <section className="adm-tesda-section">
            <div className="adm-tesda-section-header-row">
              <h3 className="adm-tesda-section-title">Student Profile</h3>
              <SectionEditControls
                sectionKey="profile"
                editingSection={editingSection}
                saving={sectionSaving}
                onEdit={() => startEdit('profile', {
                  first_name: profile.first_name ?? '',
                  middle_name: profile.middle_name ?? '',
                  last_name: profile.last_name ?? '',
                  name_extension: profile.name_extension ?? '',
                  email: profile.email ?? '',
                  contact_no: profile.contact_no ?? '',
                  facebook_link: profile.facebook_link ?? '',
                  sex: profile.sex ?? '',
                  birth_date: toDateInputValue(profile.birth_date),
                  nationality: profile.nationality ?? '',
                  civil_status: profile.civil_status ?? '',
                  employment_status: profile.employment_status ?? '',
                  highest_educ_attainment: profile.highest_educ_attainment ?? '',
                  birthplace_region: profile.birthplace_region ?? '',
                  birthplace_province: profile.birthplace_province ?? '',
                  birthplace_city: profile.birthplace_city ?? '',
                })}
                onSave={handleSaveProfile}
                onCancel={cancelEdit}
              />
            </div>
            {editingSection === 'profile' && sectionError && (
              <p className="adm-tesda-section-error">{sectionError}</p>
            )}

            <div className="adm-info-grid">
              {editingSection === 'profile' ? (
                <>
                  <EditableField label="First Name" value={draft.first_name} onChange={v => updateDraft('first_name', toTitleCase(v))} required />
                  <EditableField label="Middle Name" value={draft.middle_name} onChange={v => updateDraft('middle_name', toTitleCase(v))} />
                  <EditableField label="Last Name" value={draft.last_name} onChange={v => updateDraft('last_name', toTitleCase(v))} required />
                  <EditableField label="Name Extension" type="select" options={NAME_EXTENSIONS} value={draft.name_extension} onChange={v => updateDraft('name_extension', v)} />
                  <EditableField
                    label="Email"
                    type="text"
                    value={draft.email}
                    error={fieldErrors.email}
                    required
                    onChange={v => {
                      updateDraft('email', v);
                      setFieldErrors(prev => ({ ...prev, email: validateEmailFormat(v) }));
                    }}
                  />
                  <EditableField
                    label="Contact No."
                    value={draft.contact_no}
                    error={fieldErrors.contact_no}
                    required
                    onChange={v => {
                      const digits = v.replace(/\D/g, '').slice(0, 11);
                      updateDraft('contact_no', digits);
                      setFieldErrors(prev => ({ ...prev, contact_no: validateMobile(digits) }));
                    }}
                  />
                  <EditableField
                    label="Facebook"
                    value={draft.facebook_link}
                    error={fieldErrors.facebook_link}
                    onChange={v => {
                      updateDraft('facebook_link', v);
                      setFieldErrors(prev => ({ ...prev, facebook_link: validateFacebookLink(v) }));
                    }}
                  />
                  <EditableField label="Sex" type="select" options={SEX_OPTIONS} value={draft.sex} onChange={v => updateDraft('sex', v)} required />
                  <EditableField
                    label="Birthdate"
                    type="date"
                    value={draft.birth_date}
                    min={getAgeDateBounds().min}
                    max={getAgeDateBounds().max}
                    error={fieldErrors.birth_date}
                    required
                    onChange={v => {
                      updateDraft('birth_date', v);
                      setFieldErrors(prev => ({ ...prev, birth_date: validateAge(v) }));
                    }}
                  />
                  <EditableField label="Nationality" type="select" options={nationalities} value={draft.nationality} onChange={v => updateDraft('nationality', v)} required />
                  <EditableField label="Civil Status" type="select" options={CIVIL_STATUS_OPTIONS} value={draft.civil_status} onChange={v => updateDraft('civil_status', v)} required />
                  <EditableField label="Employment" type="select" options={EMPLOYMENT_OPTIONS} value={draft.employment_status} onChange={v => updateDraft('employment_status', v)} required />
                  <EditableField label="Education" type="select" options={EDUC_ATTAINMENT_OPTIONS} value={draft.highest_educ_attainment} onChange={v => updateDraft('highest_educ_attainment', v)} required />
                  <AddressCascadeFields
                    draft={draft}
                    updateDraft={updateDraft}
                    regionField="birthplace_region"
                    provinceField="birthplace_province"
                    cityField="birthplace_city"
                    // => no barangayField - birthplace only goes down to city,
                    //    matching TESDAStep2.jsx's birthplace section
                  />
                </>
              ) : (
                <>
                  <InfoCard label="Full Name"    value={fullName(profile)} />
                  <InfoCard label="Email"        value={profile.email || '-'} />
                  <InfoCard label="Contact No."  value={profile.contact_no || '-'} />
                  <InfoCard label="Facebook"     value={profile.facebook_link || '-'} />
                  <InfoCard label="Sex"          value={profile.sex || '-'} />
                  <InfoCard label="Birthdate"    value={formatDate(profile.birth_date)} />
                  <InfoCard label="Nationality"  value={profile.nationality || '-'} />
                  <InfoCard label="Civil Status" value={profile.civil_status || '-'} />
                  <InfoCard label="Employment"   value={profile.employment_status || '-'} />
                  <InfoCard label="Education"    value={profile.highest_educ_attainment || '-'} />
                  <InfoCard
                    label="Birthplace"
                    value={
                      [
                        birthplaceNames.city     ?? profile.birthplace_city,
                        birthplaceNames.province ?? profile.birthplace_province,
                        birthplaceNames.region   ?? profile.birthplace_region,
                      ].filter(Boolean).join(', ') || '-'
                    }
                  />
                </>
              )}
            </div>

            {/* => Address is a separate table/endpoint - its own edit toggle */}
            <div className="adm-tesda-section-header-row" style={{ marginTop: '18px' }}>
              <p className="adm-info-label" style={{ margin: 0 }}>Address</p>
              <SectionEditControls
                sectionKey="address"
                editingSection={editingSection}
                saving={sectionSaving}
                onEdit={() => startEdit('address', {
                  street: address?.street ?? '',
                  region_code: address?.region_code ?? '',
                  province_code: address?.province_code ?? '',
                  city_code: address?.city_code ?? '',
                  barangay_code: address?.barangay_code ?? '',
                })}
                onSave={handleSaveAddress}
                onCancel={cancelEdit}
              />
            </div>
            {editingSection === 'address' && sectionError && (
              <p className="adm-tesda-section-error">{sectionError}</p>
            )}
            {editingSection === 'address' ? (
              <div className="adm-info-grid" style={{ marginTop: '12px' }}>
                <EditableField label="Street" value={draft.street} onChange={v => updateDraft('street', v)} required />
                <AddressCascadeFields
                  draft={draft}
                  updateDraft={updateDraft}
                  regionField="region_code"
                  provinceField="province_code"
                  cityField="city_code"
                  barangayField="barangay_code"
                />
              </div>
            ) : address && (
              <div className="adm-info-grid" style={{ marginTop: '12px' }}>
                <InfoCard label="Street"   value={address.street || '-'} />
                <InfoCard label="Region"   value={(locationNames.region ?? address.region_code) || '-'} />
                <InfoCard label="Province" value={(locationNames.province ?? address.province_code) || '-'} />
                <InfoCard label="City"     value={(locationNames.city ?? address.city_code) || '-'} />
                <InfoCard label="Barangay" value={(locationNames.barangay ?? address.barangay_code) || '-'} />
              </div>
            )}
          </section>

          {/* ════════════════════════════════════
              GUARDIAN
              => Shows an "Add Guardian" edit trigger if no row exists yet,
                 since upsertGuardian on the backend inserts on first save.
              ════════════════════════════════════ */}
          <section className="adm-tesda-section">
            <div className="adm-tesda-section-header-row">
              <h3 className="adm-tesda-section-title">Guardian</h3>
              <SectionEditControls
                sectionKey="guardian"
                editingSection={editingSection}
                saving={sectionSaving}
                onEdit={() => startEdit('guardian', {
                  guardian_name: guardian?.guardian_name ?? '',
                  guardian_address: guardian?.guardian_address ?? '',
                  guardian_contact_no: guardian?.guardian_contact_no ?? '',
                })}
                onSave={handleSaveGuardian}
                onCancel={cancelEdit}
              />
            </div>
            {editingSection === 'guardian' && sectionError && (
              <p className="adm-tesda-section-error">{sectionError}</p>
            )}
            {editingSection === 'guardian' ? (
              <div className="adm-info-grid">
                <EditableField label="Guardian Name" value={draft.guardian_name} onChange={v => updateDraft('guardian_name', v)} required />
                <EditableField label="Guardian Address" value={draft.guardian_address} onChange={v => updateDraft('guardian_address', v)} />
                <EditableField
                  label="Guardian Contact No."
                  value={draft.guardian_contact_no}
                  error={fieldErrors.guardian_contact_no}
                  onChange={v => {
                    const digits = v.replace(/\D/g, '').slice(0, 11);
                    updateDraft('guardian_contact_no', digits);
                    setFieldErrors(prev => ({ ...prev, guardian_contact_no: validateMobile(digits) }));
                  }}
                />
              </div>
            ) : guardian ? (
              <div className="adm-info-grid">
                <InfoCard label="Guardian Name"    value={guardian.guardian_name || '-'} />
                <InfoCard label="Guardian Address" value={guardian.guardian_address || '-'} />
                <InfoCard label="Guardian Contact No." value={guardian.guardian_contact_no || '-'} />
              </div>
            ) : (
              <p className="adm-empty-note">No guardian on file. Click the pencil to add one.</p>
            )}
          </section>

          {/* ════════════════════════════════════
              SUBMITTED DOCUMENTS
              => Replace + Add: each existing doc gets a Replace file input;
                 the block below lets admins add a new document type that
                 wasn't originally submitted.
              ════════════════════════════════════ */}
          <section className="adm-tesda-section">
            <h3 className="adm-tesda-section-title">
              Submitted Documents
              <span className="adm-tesda-section-count-inline">{docs.length}</span>
            </h3>
            {docError && <p className="adm-tesda-section-error">{docError}</p>}

            {docs.length === 0 ? (
              <p className="adm-empty-note">No documents uploaded.</p>
            ) : (
              <div className="adm-docs-grid">
                {docs.map(doc => (
                  <DocPreview
                    key={doc.public_id}
                    documentKey={doc.document_key}
                    documentType={doc.document_type}
                    docPublicId={doc.public_id}
                    onOpenModal={handleOpenModal}
                    onReplace={handleReplaceDoc}
                    replacing={replacingDocId === doc.public_id}
                    onDelete={docId => setDeleteConfirmDoc(docId)}
                    deleting={deletingDocId === doc.public_id}
                    isOriginal={doc.is_original}
                  />
                ))}
              </div>
            )}

            <div className="adm-add-doc-row">
              <input
                className="adm-edit-input"
                placeholder="Document type (e.g. NBI Clearance)"
                value={addDocType}
                onChange={e => setAddDocType(e.target.value)}
              />
              <input
                id="add-doc-file-input"
                key={addDocInputKey}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                style={{ display: 'none' }}
                onChange={e => setAddDocFile(e.target.files?.[0] ?? null)}
              />
              <label htmlFor="add-doc-file-input" className="adm-tesda-doc-replace-btn">
                {addDocFile ? addDocFile.name : 'Choose File'}
              </label>
              <button className="adm-status-btn" onClick={handleAddDoc} disabled={addingDoc}>
                {addingDoc ? 'Adding…' : 'Add Document'}
              </button>
            </div>
          </section>

          {/* ════════════════════════════════════
              ACTIVITY LOGS
              ════════════════════════════════════ */}
          <section className="adm-tesda-section">
            <h3 className="adm-tesda-section-title">
              Activity Logs
              <span className="adm-tesda-section-count-inline">{logs.length}</span>
            </h3>

            {logs.length === 0 ? (
              <p className="adm-empty-note">No activity recorded yet.</p>
            ) : (() => {
              // => Client-side pagination - logs come back as one full array
              //    in the detail bundle, this slices it into 10-per-page for
              //    LogComponent
              const LOGS_PER_PAGE = 10;
              const totalLogPages = Math.max(1, Math.ceil(logs.length / LOGS_PER_PAGE));
              const currentLogPage = Math.min(logPage, totalLogPages);
              const pagedLogs = logs.slice(
                (currentLogPage - 1) * LOGS_PER_PAGE,
                currentLogPage * LOGS_PER_PAGE
              );

              return (
                <LogComponent
                  logs={pagedLogs}
                  columns={logColumns}
                  page={currentLogPage}
                  totalPages={totalLogPages}
                  onPageChange={setLogPage}
                  renderDetail={(log) => <p>{log.remarks || '-'}</p>}
                />
              );
            })()}
          </section>

          {/* ════════════════════════════════════
              CONFIRM STATUS CHANGE MODAL
              ════════════════════════════════════ */}
          {/* => Approving adds a reminder about physical document
               verification - this can't be enforced by the system since
               only staff can physically compare copies against
               originals, so it's a prompt, not a blocking check */}
          <ConfirmModal
            isOpen={confirmOpen}
            message={
              STATUS_CONFIRM_WARNINGS[selectedStatus]
                ? `Change enrollment status to "${selectedStatus}"? ${STATUS_CONFIRM_WARNINGS[selectedStatus]}`
                : `Change enrollment status to "${selectedStatus}"?`
            }
            onConfirm={handleStatusConfirmed}
            onCancel={() => setConfirmOpen(false)}
          />

          <ConfirmModal
            isOpen={!!deleteConfirmDoc}
            message="Delete this document? This can't be undone."
            onConfirm={() => handleDeleteDoc(deleteConfirmDoc)}
            onCancel={() => setDeleteConfirmDoc(null)}
          />

          {/* ════════════════════════════════════
              DOCUMENT MODAL
              ════════════════════════════════════ */}
          {modal && (
            <div className="adm-modal-backdrop" onClick={handleCloseModal}>
              <div
                className="adm-modal-box"
                onClick={e => e.stopPropagation()}
              >
                <div className="adm-modal-header">
                  <span className="adm-modal-title">{modal.documentType}</span>
                  <button className="adm-modal-close" onClick={handleCloseModal}>✕</button>
                </div>

                {modal.isPdf ? (
                  <iframe
                    src={modal.url}
                    className="adm-modal-iframe"
                    title={modal.documentType}
                  />
                ) : (
                  <img
                    src={modal.url}
                    alt={modal.documentType}
                    className="adm-modal-img"
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}