// => admin/components/SHSEnrollmentDetail/shsEnrollmentDetail.jsx
// => Full SHS enrollment detail for admins: student info, academic history,
//    family members, emergency contact, health info, consent, submitted
//    documents, audit log, status changer, and section-level Edit Mode (CRUD).
// => Field names verified against the Site/Student Dashboard server.js schema
//    (shs_enrollments, shs_family_members, shs_classes, shs_documents,
//    student_profile, student_address).
// => Edit Mode added: pencil icon per section, whole section becomes
//    editable, one Save/Cancel per section. Nothing is field-locked.
//    Class reassignment stays read-only - deferred until a proper picker
//    endpoint exists (matches earlier project decision).
// => Family Members edit mode edits the VALUES of existing rows only - it
//    does not add/remove which roles exist, to avoid tripping the
//    both-parents-or-guardian DEFERRABLE constraint trigger on the backend.

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import BackButton from '../../BackButton/BackButton.jsx';
import axiosAdmin from '../../../utils/axiosAdmin.js';
import toast from 'react-hot-toast';

import './shsEnrollmentDetail.css';

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
// => Same values as TESDA - 'Completed' replaced with 'For Assessment',
//    'Reviewed' and 'Failed Assessment' added
const STATUS_OPTIONS = [
  'Pending', 'Reviewed', 'Approved', 'Needs Clarification', 'Rejected',
  'Dropped', 'For Assessment', 'Passed Assessment', 'Failed Assessment', 'Reserved',
];

const NAME_EXTENSIONS = ['N/A', 'Jr.', 'Sr.', 'II', 'III', 'IV', 'V'];

const RELIGIONS = [
  'Roman Catholic', 'Islam', 'Iglesia ni Cristo', 'Evangelical',
  'Aglipayan (Philippine Independent Church)', 'Seventh-Day Adventist',
  "Jehovah's Witness", 'Baptist', 'Born Again Christian',
  'United Church of Christ in the Philippines (UCCP)', 'Methodist',
  'Buddhist', 'Prefer not to say', 'Others',
];

const STATUS_DESCRIPTIONS = {
  'Pending': 'Submitted and awaiting initial review.',
  'Reviewed': 'Enrollment has been reviewed with no issues. The student must submit photocopies of the documents along with the original ones as reference to be approved.',
  'Approved': 'Reviewed and accepted - the student is officially enrolled.',
  'Needs Clarification': 'Missing or unclear information - waiting on the student to respond.',
  'Rejected': 'Enrollment was declined.',
  'Dropped': 'Student withdrew or was removed after being enrolled.',
  'For Assessment': 'Training finished - student is scheduled for competency assessment.',
  'Passed Assessment': 'Student passed the competency assessment and is certified.',
  'Failed Assessment': 'Student did not pass the competency assessment.',
  'Reserved': 'No open class section yet - held until one becomes available.',
};

// => Same warnings as TESDA, minus the reservation-fee mention since SHS
//    has no such fee. Batch-capacity sweep note added below, same
//    reasoning as tesdaEnrollmentDetail.jsx's version.
const STATUS_CONFIRM_WARNINGS = {
  'Approved': 'Please confirm the student has submitted physical photocopies of their documents and that these have been compared against the original copies before proceeding. Note: if this approval fills the batch to its max capacity, any other students still Pending or Reviewed in this same batch will automatically be moved back to Reserved so they can be placed in a future batch.',
  'Failed Assessment': 'This marks the assessment as failed and will be visible to the student on their dashboard.',
  'Rejected': 'This will reject the enrollment application and will be visible to the student on their dashboard.',
  'Dropped': 'This will mark the student as dropped from the program and will be visible to the student on their dashboard.',
};

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

// => shs_family_members.role CHECK constraint order - Father/Mother first, Guardian last
const ROLE_ORDER = ['Father', 'Mother', 'Guardian'];

const SEX_OPTIONS = ['Male', 'Female'];
const MEDICAL_OPTIONS = ['none', 'yes'];

// Utility helpers
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
};

// => True only when the batch has an end_date AND today is on/after it -
//    same reasoning as tesdaEnrollmentDetail.jsx
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

// => Used by the Miscellaneous Fee Payments section - this file never
//    had a currency formatter before that section was added.
const formatCurrency = (amount) => {
  if (amount == null) return '-';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
};

// => student_profile columns are last_name / first_name / middle_name / name_extension
const fullName = (p) =>
  [p.first_name, p.middle_name, p.last_name, p.name_extension]
    .filter(v => v && v.trim().toUpperCase() !== 'N/A')
    .join(' ') || '-';

const MIN_AGE = 16; // => matches SHSStep1.jsx MIN_AGE
const MAX_AGE = 100; // => matches SHSStep1.jsx MAX_AGE

const validateMobile = (value) => {
  if (!value) return null;
  if (!/^09\d{9}$/.test(value)) return 'Must start with 09 and be exactly 11 digits.';
  return null;
};

// => Same EMAIL_REGEX/FACEBOOK_LINK_REGEX as TESDAStep1.jsx, SHSStep1.jsx,
// => tesdaEnrollmentDetail.jsx, and StudentDetail.jsx - all five write to
// => (or read from) the same student_profile.email / .facebook_link
// => columns, so they all enforce identically.
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const validateEmailFormat = (value) => {
  if (!value) return 'Email address is required.';
  if (!EMAIL_REGEX.test(value)) return 'Please enter a valid email address.';
  return null;
};

// => Accepts facebook.com with no subdomain, www., or Meta's actual
// => "web." desktop subdomain. fb.com shortlinks no longer accepted.
const FACEBOOK_LINK_REGEX = /^(https?:\/\/)?(www\.|web\.)?facebook\.com\/.+$/i;
const validateFacebookLink = (value) => {
  if (!value) return 'Facebook profile link is required.';
  if (!FACEBOOK_LINK_REGEX.test(value)) return 'Please enter a valid Facebook profile link (e.g. https://www.facebook.com/yourname).';
  return null;
};

const validateLRN = (value) => {
  if (!value) return null;
  if (!/^\d{12}$/.test(value)) return 'LRN must be exactly 12 digits.';
  return null;
};

const toProperCase = (value) => {
  if (!value) return value;
  return value.replace(/\b\w+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
};

const computeAge = (birthDateStr) => {
  if (!birthDateStr) return null;
  const birth = new Date(birthDateStr);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};    

const toDateInputValue = (dateStr) => (dateStr ? String(dateStr).slice(0, 10) : '');

// InfoCard - reusable read-only label+value cell
// => onViewFull: optional callback that renders a "View Full" trigger next to
//    the label, for long-text fields like Electives - pair with `clamp`.
// => clamp: visually truncates the value to 2 lines so the button has a purpose.
function InfoCard({ label, value, copyable = true, onViewFull = null, clamp = false }) {
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
      <div className="adm-info-label-row">
        <p className="adm-info-label">{label}</p>
        {onViewFull && (
          <button type="button" className="adm-view-full-btn" onClick={onViewFull}>
            View Full
          </button>
        )}
      </div>
      <div className="adm-info-value-row">
        <p className={`adm-info-value ${clamp ? 'adm-info-value--clamp' : ''}`}>{value}</p>
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

// => EditableField - edit-mode counterpart to InfoCard
function EditableField({ label, value, onChange, type = 'text', options = null, error = null, disabled = false, required = false, min = undefined, max = undefined }) {
  // => Shared label - required fields get a red asterisk, driven by
  //    server.js's NOT NULL constraints, not guesswork.
  const labelEl = (
    <p className="adm-info-label">
      {label}
      {required && <span className="adm-req-asterisk"> *</span>}
    </p>
  );

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
        <p className="adm-info-label">Region <span className="adm-req-asterisk">*</span></p>
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
          <p className="adm-info-label">City / Municipality <span className="adm-req-asterisk">*</span></p>
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
          <p className="adm-info-label">Barangay <span className="adm-req-asterisk">*</span></p>
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

  // => SHS uploads are JPG/PNG only (stricter than TESDA's JPG/PNG/PDF)
  const isPdf = documentKey?.toLowerCase().endsWith('.pdf');

  const inputId = `replace-doc-${docPublicId}`;

  return (
    <div className="adm-doc-preview">
      <p className="adm-doc-type">{documentType}</p>

      {loading && (
        <div className="adm-doc-preview-state">
          <div className="adm-spinner adm-spinner--sm" />
          <span>Loading…</span>
        </div>
      )}

      {error && !loading && (
        <div className="adm-doc-preview-state adm-doc-preview-state--error">
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

      <div className="adm-doc-replace-row">
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) onReplace(docPublicId, file);
            e.target.value = '';
          }}
        />
        <label htmlFor={inputId} className="adm-doc-replace-btn">
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
export default function SHSEnrollmentDetail() {
  const { publicId } = useParams();
  const navigate     = useNavigate();

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const [selectedStatus, setSelectedStatus] = useState('');
  // => Client-side pagination for the Activity Logs table - same
  //    reasoning as tesdaEnrollmentDetail.jsx
  const [logPage, setLogPage] = useState(1);

  const [nationalities, setNationalities] = useState([]);
  const [saving,         setSaving]         = useState(false);
  // => saveMsg state removed - status save feedback now goes through
  //    react-hot-toast instead of an inline banner
  const [internalRemarksDraft, setInternalRemarksDraft] = useState('');
  const [externalRemarksDraft, setExternalRemarksDraft] = useState('');
  const [savingInternalRemarks, setSavingInternalRemarks] = useState(false);

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

  // => Payment & Refund History - placeholder state for now, wired to a
  //    real fetch in Step 3 once the backend endpoint exists.
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [batchMiscFeeTotal, setBatchMiscFeeTotal] = useState(0);
  // => Total paid toward this enrollment's batch misc fees, for the
  //    For Assessment gate balance display
  const [totalPaid, setTotalPaid] = useState(0);
  const [electivesModalOpen, setElectivesModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [classOptions, setClassOptions] = useState([]);
  const [loadingClassOptions, setLoadingClassOptions] = useState(false);  

  const handleOpenModal  = (doc) => setModal(doc);
  const handleCloseModal = ()    => setModal(null);

  const [locationNames, setLocationNames] = useState({
    region: null, province: null, city: null, barangay: null,
  });

  // 
  // EDIT MODE STATE - same pattern as TESDA. Section keys used here:
  // 'enrollmentInfo' | 'academic' | 'profile' | 'address' | 'family' |
  // 'emergency' | 'health' | 'consent'
  // 
  const [editingSection, setEditingSection] = useState(null);
  const [draft,          setDraft]          = useState({});
  const [sectionSaving,  setSectionSaving]  = useState(false);
  const [sectionError,   setSectionError]   = useState(null);

  const [replacingDocId, setReplacingDocId] = useState(null);
  const [docError, setDocError] = useState(null);
  const [addDocType, setAddDocType] = useState('');
  const [addDocFile, setAddDocFile] = useState(null);
  const [addingDoc,  setAddingDoc]  = useState(false);
  
  const [fieldErrors, setFieldErrors] = useState({});

  const [addDocInputKey, setAddDocInputKey] = useState(0); // => bumped to reset the file input after a successful add

  const [deletingDocId, setDeletingDocId] = useState(null);
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState(null); // => docPublicId pending confirmation


  const startEdit = (sectionKey, initialValues) => {
    setEditingSection(sectionKey);
    setDraft(initialValues);
    setSectionError(null);
    setFieldErrors({});
  };

  const cancelEdit = () => {
    setEditingSection(null);
    setDraft({});
    setSectionError(null);
    setFieldErrors({});
  };

  const updateDraft = (field, value) => {
    setDraft(prev => ({ ...prev, [field]: value }));
  };

  const patchSection = async (endpointPath, payload) => {
    setSectionSaving(true);
    setSectionError(null);
    try {
      const res = await axiosAdmin.patch(
        `/api/admin/enrollments/shs/${publicId}/${endpointPath}`,
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

  //  Fetch full enrollment detail 
  // => Pulled out of useEffect so handleSaveClassAssign can call it again
  //    after reassigning a class - a plain PATCH response only returns raw
  //    tesda/shs_enrollments columns, not the joined class period/groupchat
  //    data, so a full refetch is the reliable way to pick that up.
  const fetchDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/enrollments/shs/${publicId}`, {
        credentials: 'include',
      });
      if (res.status === 404) throw new Error('Enrollment not found.');
      if (!res.ok) throw new Error('Failed to fetch enrollment detail.');
      const json = await res.json();
      setData(json);
      setSelectedStatus(json.enrollment.status);
      setInternalRemarksDraft(json.enrollment.internal_remarks ?? '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!publicId) return;
    fetchDetail();
  }, [publicId]);

  // => Payment History - separate fetch, own endpoint. Doesn't block the
  //    page's main loading state; failing silently here just leaves the
  //    section at its default empty values.
  useEffect(() => {
    if (!publicId) return;

    const fetchPaymentHistory = async () => {
      try {
        const res = await fetch(`/api/admin/enrollments/shs/${publicId}/payment-history`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const json = await res.json();
        setPaymentHistory(json.records ?? []);
        setBatchMiscFeeTotal(json.batchMiscFeeTotal ?? 0);
        setTotalPaid(json.totalPaid ?? 0);
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

  // => Fetch available shs_batches matching this enrollment's cluster
  //    only when the Class/Batch section is opened for editing
  useEffect(() => {
    if (editingSection !== 'classAssign') return;
    const enr = data?.enrollment;
    if (!enr?.cluster_id) { setClassOptions([]); return; }

    setLoadingClassOptions(true);
    const params = new URLSearchParams({ cluster_id: enr.cluster_id });

    fetch(`/api/admin/enrollments/shs/classes/available?${params.toString()}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setClassOptions(d.classes || []))
      .catch(err => console.error('Failed to fetch available classes:', err))
      .finally(() => setLoadingClassOptions(false));
  }, [editingSection, data?.enrollment?.cluster_id]);

  // => Fetch nationalities for the profile
  useEffect(() => {
    fetch('/api/reference/nationalities')
      .then(r => r.json())
      .then(setNationalities)
      .catch(err => console.error('Failed to fetch nationalities:', err));
  }, []);

  // => Same reasoning as TESDA - re-fetches the full detail bundle
  //    without touching the page's loading/error state, so Activity
  //    Logs reflects a status change immediately
  const refreshDetail = async () => {
    try {
      const res = await fetch(`/api/admin/enrollments/shs/${publicId}`, {
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
  // => Switched from raw fetch to axiosAdmin so x-csrf-token is attached.
  const handleStatusSave = () => {
    if (!selectedStatus || selectedStatus === data?.enrollment?.status) return;
    // => Same reasoning as TESDA - block here before opening the confirm
    //    modal, not just after hitting a 400 from the backend gate
    if (selectedStatus === 'Needs Clarification' && !externalRemarksDraft.trim()) {
      toast.error('External Remarks is required when setting status to "Needs Clarification".');
      return;
    }
    // => Same block as TESDA - For Assessment requires the batch's
    //    training period to have actually ended
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
      await axiosAdmin.patch(`/api/admin/enrollments/shs/${publicId}/status`, {
        status: selectedStatus,
        external_remarks: externalRemarksDraft,
      });
      // => Pulls the fresh detail bundle - including the Activity Logs
      //    row the backend just wrote - instead of a manual local patch
      await refreshDetail();
      toast.success(`Status updated to "${selectedStatus}".`);
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to update status.';
      // => Same actionable toast as the TESDA version - links straight to
      //    the batch detail page on a capacity rejection
      if (errorMsg.includes('already full') && enrollment.batch_public_id) {
        toast.error((t) => (
          <span>
            {errorMsg}
            {' '}
            <button
              onClick={() => {
                toast.dismiss(t.id);
                navigate(`/dashboard/classes/shs/${enrollment.batch_public_id}`);
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
  // SECTION SAVE HANDLERS - spread-merge over existing enrollment object so
  // joined display fields (class period, groupchat_link,
  // student_username) survive a PATCH .../enrollment RETURNING * response.
  // 

  const handleSaveEnrollmentInfo = async () => {
    const lrnErr = validateLRN(draft.lrn);
    if (lrnErr) {
      setSectionError(lrnErr);
      return;
    }
    try {
      await patchSection('enrollment', {
        lrn: draft.lrn,
      });
      // => Full refetch instead of local merge - picks up the new
      //    Activity Logs row immediately, same pattern as status changes
      await refreshDetail();
      cancelEdit();
    } catch { /* sectionError already set */ }
  };

  const handleSaveAcademic = async () => {
    try {
      await patchSection('enrollment', {
        last_school_attended: draft.last_school_attended,
        school_address: draft.school_address,
        grade_level_completed: draft.grade_level_completed,
        school_year_completed: draft.school_year_completed,
      });
      await refreshDetail();
      cancelEdit();
    } catch { /* sectionError already set */ }
  };

  const handleSaveEmergency = async () => {
    const mobileErr = validateMobile(draft.emergency_contact_no);
    if (mobileErr) {
      setSectionError(mobileErr);
      return;
    }
    try {
      await patchSection('enrollment', {
        emergency_name: draft.emergency_name,
        emergency_relationship: draft.emergency_relationship,
        emergency_contact_no: draft.emergency_contact_no,
        emergency_address: draft.emergency_address,
      });
      await refreshDetail();
      cancelEdit();
    } catch { /* sectionError already set */ }
  };

  const handleSaveHealth = async () => {
    if (draft.has_medical_condition === 'yes' && !draft.medical_condition_detail?.trim()) {
      setSectionError('Condition detail is required when a medical condition is indicated.');
      return;
    }
    try {
      await patchSection('enrollment', {
        has_medical_condition: draft.has_medical_condition,
        medical_condition_detail: draft.medical_condition_detail,
        allergies: draft.allergies,
        maintenance_medication: draft.maintenance_medication,
      });
      await refreshDetail();
      cancelEdit();
    } catch { /* sectionError already set */ }
  };

   const handleSaveProfile = async () => {
    if (Object.values(fieldErrors).some(Boolean)) {
      setSectionError('Please fix the highlighted fields before saving.');
      return;
    }

    const age = computeAge(draft.birth_date);
    if (age !== null && age < MIN_AGE) {
      setSectionError(`Enrollee must be at least ${MIN_AGE} years old.`);
      return;
    }
    if (age !== null && age > MAX_AGE) {
      setSectionError(`Please check the birthdate - computed age exceeds ${MAX_AGE} years.`);
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

  // => Rebuilds the full members array in ROLE_ORDER, applying draft edits
  //    on top of whichever rows already exist - doesn't add/remove roles.
  const handleSaveFamily = async () => {
    try {
      const members = (data.familyMembers || []).map(m => ({
        role: m.role,
        full_name: draft[`${m.role}_full_name`] ?? m.full_name,
        occupation: draft[`${m.role}_occupation`] ?? m.occupation,
        contact_no: draft[`${m.role}_contact_no`] ?? m.contact_no,
        relationship_to_student: draft[`${m.role}_relationship_to_student`] ?? m.relationship_to_student,
      }));
      await patchSection('family', { members });
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

  const handleSaveInternalRemarks = async () => {
    setSavingInternalRemarks(true);
    try {
      const result = await patchSection('enrollment', { internal_remarks: internalRemarksDraft });
      setData(prev => ({ ...prev, enrollment: { ...prev.enrollment, ...result.enrollment } }));
    } catch { /* sectionError already set */ }
    finally { setSavingInternalRemarks(false); }
  };

  // 
  // DOCUMENT HANDLERS - Replace + Delete + Add 
  // 
  const handleReplaceDoc = async (docPublicId, file) => {
    setReplacingDocId(docPublicId);
    setDocError(null);
    try {
      const formData = new FormData();
      formData.append('document', file);
      const res = await axiosAdmin.patch(
        `/api/admin/enrollments/shs/${publicId}/docs/${docPublicId}`,
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
      await axiosAdmin.delete(`/api/admin/enrollments/shs/${publicId}/docs/${docPublicId}`);
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
        `/api/admin/enrollments/shs/${publicId}/docs`,
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
  const enrollment = data?.enrollment ?? {};
  const profile     = data?.profile     ?? {};
  const docs        = data?.docs        ?? [];
  const address     = data?.address     ?? null;
  const familyMembers = data?.familyMembers ?? [];
  // => Read-only G11/G12 courses for this enrollment's cluster - see
  //    fetchShsEnrollmentDetail in adminEnrollmentService.js
  const clusterCourses = data?.clusterCourses ?? [];
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

  const sortedFamily = [...familyMembers].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
  );
  // => Only show the Relationship column at all if a Guardian row exists -
  //    it's meaningless/redundant for Father/Mother rows.
  const hasGuardianRow = sortedFamily.some(f => f.role === 'Guardian');

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
  //    page - same reasoning as the TESDA version
  const classPeriodSuffix = !enrollment.batch_id
    ? ''
    : !enrollment.start_date
      ? ' (dates TBA)'
      : !enrollment.end_date
        ? ` - ${formatDate(enrollment.start_date)} - Ongoing`
        : ` - ${formatDate(enrollment.start_date)} - ${formatDate(enrollment.end_date)}`;

  const classPeriodValue = enrollment.batch_id && enrollment.batch_public_id ? (
    <>
      <Link to={`/dashboard/classes/shs/${enrollment.batch_public_id}`} className="adm-view-batch-link">
        {enrollment.batch_name}
      </Link>
      {classPeriodSuffix}
    </>
  ) : classPeriodDisplay;  

  return (
    <div className="adm-detail-page">

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
              HEADER: track/cluster + student name + status badge
              ════════════════════════════════════ */}
          <div className="adm-detail-hero">
            <div className="adm-hero-left">
              {/* => Shows the cluster (e.g. "Academic Track" grouping), not the
                   specific course - clearer at-a-glance context than course_name */}
              <p className="adm-hero-course">{enrollment.cluster || '-'}</p>
              <h2 className="adm-hero-name">{fullName(profile)}</h2>
              <p className="adm-hero-email">{enrollment.student_username}</p>
            </div>
            {/* => Type badge sits left of status, since this component is
                 always TESDA - hardcoded rather than read from data */}
            <div className="adm-hero-badges">
              <span className="adm-hero-type-badge adm-hero-type-badge--shs">SHS</span>
              <span className={`adm-hero-badge ${statusClass[enrollment.status] || ''}`}>
                {enrollment.status}
              </span>
              {/* => Balance badge for the For Assessment gate - batch misc
                   fees only, no course fee (DepEd covers SHS tuition).
                   Moved here from Update Status for the same reason as TESDA. */}
              <span className={`adm-hero-balance-badge ${totalPaid >= batchMiscFeeTotal ? 'adm-hero-balance-badge--paid' : 'adm-hero-balance-badge--unpaid'}`}>
                {batchMiscFeeTotal <= 0
                  ? 'No Fee Assigned'
                  : totalPaid >= batchMiscFeeTotal
                  ? 'Balance Cleared'
                  : `₱${(batchMiscFeeTotal - totalPaid).toFixed(2)} Due`}
              </span>
            </div>
          </div>

          {/* ════════════════════════════════════
              STATUS CHANGER
              ════════════════════════════════════ */}
          <section className="adm-section">
            <h3 className="adm-section-title">Update Status</h3>
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
                  //    shsEnrollmentService.js. Note: misc-fee balance
                  //    clearing for "For Assessment" isn't checked
                  //    client-side here since payment totals aren't loaded
                  //    into this component - it only surfaces via the
                  //    backend error toast.
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
                        totalPaid < batchMiscFeeTotal
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
                  : selectedStatus === 'For Assessment' && totalPaid < batchMiscFeeTotal
                  ? 'Balance must be fully cleared before this enrollment can be set to "For Assessment".'
                  : selectedStatus === 'Failed Assessment' && enrollment.status !== 'For Assessment' && enrollment.status !== 'Failed Assessment'
                  ? 'Enrollment must be in "For Assessment" status before it can be set to "Failed Assessment".'
                  : STATUS_DESCRIPTIONS[selectedStatus]}
              </span>

              {/* => External Remarks: shown/emailed to the student. No Save
                   button - clears when status is changed, restores when
                   switched back, only persists to DB on Save Status confirm */}
              <div className="adm-remarks-group adm-remarks-group--external">
                <label className="adm-remarks-label adm-remarks-label--external" htmlFor="shs-external-remarks">
                  External Remarks
                  {selectedStatus === 'Needs Clarification' && (
                    <span className="adm-remarks-required"> (required)</span>
                  )}
                </label>
                <textarea
                  id="shs-external-remarks"
                  className="adm-remarks-input adm-remarks-input--external"
                  placeholder="Note shown to the student when this status is saved…"
                  value={externalRemarksDraft}
                  onChange={e => setExternalRemarksDraft(e.target.value)}
                />
              </div>

              {/* => Internal Remarks: staff-only, own Save button, not tied to status */}
              <div className="adm-remarks-group adm-remarks-group--internal">
                <div className="adm-remarks-header">
                  <label className="adm-remarks-label adm-remarks-label--internal" htmlFor="shs-internal-remarks">
                    Internal Remarks
                  </label>
                  <button
                    className="adm-remarks-save-btn adm-remarks-save-btn--internal"
                    onClick={handleSaveInternalRemarks}
                    disabled={savingInternalRemarks}
                  >
                    {savingInternalRemarks ? 'Saving…' : 'Save'}
                  </button>
                </div>
                <textarea
                  id="shs-internal-remarks"
                  className="adm-remarks-input adm-remarks-input--internal"
                  placeholder="Staff-only note (not visible to the student)…"
                  value={internalRemarksDraft}
                  onChange={e => setInternalRemarksDraft(e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* ════════════════════════════════════
              ENROLLMENT INFORMATION
              => Date Submitted stays read-only. LRN/Track/Cluster/Electives
                 are direct columns, fully editable.
              ════════════════════════════════════ */}
          <section className="adm-section">
            <div className="adm-section-header-row">
              <h3 className="adm-section-title">Enrollment Information</h3>
              <SectionEditControls
                sectionKey="enrollmentInfo"
                editingSection={editingSection}
                saving={sectionSaving}
                onEdit={() => startEdit('enrollmentInfo', {
                  lrn: enrollment.lrn ?? '',
                  cluster: enrollment.cluster ?? '',
                  electives: enrollment.electives ?? '',
                })}
                onSave={handleSaveEnrollmentInfo}
                onCancel={cancelEdit}
              />
            </div>
            {editingSection === 'enrollmentInfo' && sectionError && (
              <p className="adm-section-error">{sectionError}</p>
            )}
            <div className="adm-info-grid">
              {editingSection === 'enrollmentInfo' ? (
                <>
                  <EditableField label="LRN" value={draft.lrn} onChange={v => updateDraft('lrn', v.replace(/\D/g, '').slice(0, 12))} />
                  {/* => Cluster is locked from editing - it feeds directly into
                       class/batch assignment, so changing it mid-enrollment risks
                       orphaning the link. If it's wrong, reject + have the student
                       resubmit via the dashboard instead. */}
                  <InfoCard label="Cluster" value={enrollment.cluster || '-'} />
                  <InfoCard
                    label="Electives"
                    value={enrollment.electives || '-'}
                    clamp
                    onViewFull={enrollment.electives ? () => setElectivesModalOpen(true) : null}
                  />
                </>
              ) : (
                <>
                  <InfoCard label="LRN"            value={enrollment.lrn || '-'} />
                  <InfoCard label="Cluster"        value={enrollment.cluster || '-'} />
                  <InfoCard
                    label="Electives"
                    value={enrollment.electives || '-'}
                    clamp
                    onViewFull={enrollment.electives ? () => setElectivesModalOpen(true) : null}
                  />
                </>
              )}

              {/* => Cluster Curriculum - ALWAYS read-only, shown outside the
                   edit-mode ternary above since there's no editing path for
                   it at all. Courses belong to the cluster catalog
                   (shs_courses), not to this specific enrollment - if the
                   student picked the wrong cluster, reject + have them
                   resubmit instead of editing this. */}
              <div className="adm-info-card adm-curriculum-card">
                <p className="adm-info-label">Cluster Curriculum</p>
                {clusterCourses.length === 0 ? (
                  <p className="adm-info-value">-</p>
                ) : (
                  <div className="adm-curriculum-groups">
                    {['Grade 11', 'Grade 12'].map((grade) => {
                      const gradeCourses = clusterCourses.filter(c => c.grade_level === grade);
                      if (gradeCourses.length === 0) return null;
                      return (
                        <div key={grade} className="adm-curriculum-group">
                          <span className="adm-curriculum-grade">{grade}</span>
                          <ul className="adm-curriculum-list">
                            {gradeCourses.map(({ course_id, title, course_link }) => (
                              <li key={course_id} className="adm-curriculum-item">
                                {course_link ? (
                                  <a href={course_link} target="_blank" rel="noopener noreferrer">{title}</a>
                                ) : title}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <InfoCard label="Date Submitted" value={formatDate(enrollment.submitted_at)} />
            </div>
          </section>

          {/* ════════════════════════════════════
              ACADEMIC INFORMATION
              ════════════════════════════════════ */}
          <section className="adm-section">
            <div className="adm-section-header-row">
              <h3 className="adm-section-title">Academic Information</h3>
              <SectionEditControls
                sectionKey="academic"
                editingSection={editingSection}
                saving={sectionSaving}
                onEdit={() => startEdit('academic', {
                  last_school_attended: enrollment.last_school_attended ?? '',
                  school_address: enrollment.school_address ?? '',
                  grade_level_completed: enrollment.grade_level_completed ?? '',
                  school_year_completed: enrollment.school_year_completed ?? '',
                })}
                onSave={handleSaveAcademic}
                onCancel={cancelEdit}
              />
            </div>
            {editingSection === 'academic' && sectionError && (
              <p className="adm-section-error">{sectionError}</p>
            )}
            <div className="adm-info-grid">
              {editingSection === 'academic' ? (
                <>
                  <EditableField label="Last School Attended" value={draft.last_school_attended} onChange={v => updateDraft('last_school_attended', v)} required />
                  <EditableField label="School Address" value={draft.school_address} onChange={v => updateDraft('school_address', v)} required />
                  <EditableField label="Grade Level Completed" value={draft.grade_level_completed} onChange={v => updateDraft('grade_level_completed', v)} required />
                  <EditableField label="School Year Completed" value={draft.school_year_completed} onChange={v => updateDraft('school_year_completed', v)} required />
                </>
              ) : (
                <>
                  <InfoCard label="Last School Attended" value={enrollment.last_school_attended || '-'} />
                  <InfoCard label="School Address"       value={enrollment.school_address || '-'} />
                  <InfoCard label="Grade Level Completed" value={enrollment.grade_level_completed || '-'} />
                  <InfoCard label="School Year Completed" value={enrollment.school_year_completed || '-'} />
                </>
              )}
            </div>
          </section>

          {/* ════════════════════════════════════
              MISCELLANEOUS FEE PAYMENTS (read-only)
              => No reservation-fee gate here, DepEd covers tuition. This
                 only ever tracks batch-assigned misc fees.
              ════════════════════════════════════ */}
          <section className="adm-section">
            <h3 className="adm-section-title">
              Miscellaneous Fee Payments
              <span className="adm-section-count-inline">{paymentHistory.length}</span>
            </h3>

            {paymentHistory.length === 0 ? (
              <p className="adm-empty-note">
                {batchMiscFeeTotal > 0
                  ? 'No payments or refunds recorded yet.'
                  : 'No miscellaneous fee has been assigned to this batch yet.'}
              </p>
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
              => Read-only: comes from the joined shs_classes row. Deferred.
              ════════════════════════════════════ */}
          <section className="adm-section">
            <div className="adm-section-header-row">
              <h3 className="adm-section-title">Class / Batch</h3>
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
              <p className="adm-section-error">{sectionError}</p>
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
                          ? 'No open classes for this cluster - leave unassigned'
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
              // => Matches TESDAEnrollmentDetail's Class/Batch behavior - always
              //    show the InfoCard grid with '-' fallbacks instead of a special
              //    "reserved" message box, regardless of whether a class is assigned.
              <div className="adm-info-grid adm-info-grid--halves">
                <InfoCard label="Class Period" value={classPeriodValue} copyable={false} />
                <InfoCard label="Groupchat Link" value={enrollment.groupchat_link || '-'} copyable={true} />
              </div>
            )}
          </section>

          {/* ════════════════════════════════════
              STUDENT PROFILE
              => civil_status / employment_status / highest_educ_attainment
                 are TESDA-only concepts and intentionally omitted here.
              ════════════════════════════════════ */}
          <section className="adm-section">
            <div className="adm-section-header-row">
              <h3 className="adm-section-title">Student Profile</h3>
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
                  religion: profile.religion ?? '',
                  religion_others: profile.religion_others ?? '',
                })}
                onSave={handleSaveProfile}
                onCancel={cancelEdit}
              />
            </div>
            {editingSection === 'profile' && sectionError && (
              <p className="adm-section-error">{sectionError}</p>
            )}

            <div className="adm-info-grid">
              {editingSection === 'profile' ? (
                <>
                  <EditableField label="First Name" value={draft.first_name} onChange={v => updateDraft('first_name', toProperCase(v))} required />
                  <EditableField label="Middle Name" value={draft.middle_name} onChange={v => updateDraft('middle_name', toProperCase(v))} />
                  <EditableField label="Last Name" value={draft.last_name} onChange={v => updateDraft('last_name', toProperCase(v))} required />
                  <EditableField label="Name Extension" type="select" options={NAME_EXTENSIONS} value={draft.name_extension} onChange={v => updateDraft('name_extension', v)} />
                  <EditableField
                    label="Email"
                    value={draft.email}
                    error={fieldErrors.email}
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
                    min={(() => { const t = new Date(); return new Date(t.getFullYear() - MAX_AGE, t.getMonth(), t.getDate()).toISOString().slice(0, 10); })()}
                    max={(() => { const t = new Date(); return new Date(t.getFullYear() - MIN_AGE, t.getMonth(), t.getDate()).toISOString().slice(0, 10); })()}
                    onChange={v => updateDraft('birth_date', v)}
                    required
                  />
                  <EditableField label="Nationality" type="select" options={nationalities} value={draft.nationality} onChange={v => updateDraft('nationality', v)} required />
                  <EditableField label="Religion" type="select" options={RELIGIONS} value={draft.religion} onChange={v => updateDraft('religion', v)} />
                  {draft.religion === 'Others' && (
                    <EditableField label="Religion (Others)" value={draft.religion_others} onChange={v => updateDraft('religion_others', v)} />
                  )}
                </>
              ) : (
                <>
                  <InfoCard label="Full Name"   value={fullName(profile)} />
                  <InfoCard label="Email"       value={profile.email || '-'} />
                  <InfoCard label="Contact No." value={profile.contact_no || '-'} />
                  <InfoCard label="Facebook"    value={profile.facebook_link || '-'} />
                  <InfoCard label="Sex"         value={profile.sex || '-'} />
                  <InfoCard label="Birthdate"   value={formatDate(profile.birth_date)} />
                  <InfoCard label="Nationality" value={profile.nationality || '-'} />
                  <InfoCard
                    label="Religion"
                    value={
                      profile.religion === 'Others'
                        ? (profile.religion_others || 'Others')
                        : (profile.religion || '-')
                    }
                  />
                </>
              )}
            </div>

            {/* => Address is a separate table/endpoint - its own edit toggle */}
            <div className="adm-section-header-row" style={{ marginTop: '18px' }}>
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
              <p className="adm-section-error">{sectionError}</p>
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
              FAMILY MEMBERS
              => Edits the values of existing rows only - can't add/remove
                 roles from this UI (would risk the both-parents-or-guardian
                 trigger). Each existing row gets its own inline inputs when
                 the section is in edit mode.
              ════════════════════════════════════ */}
          <section className="adm-section">
            <div className="adm-section-header-row">
              <h3 className="adm-section-title">
                Family Members
                <span className="adm-section-count-inline">{sortedFamily.length}</span>
              </h3>
              {sortedFamily.length > 0 && (
                <SectionEditControls
                  sectionKey="family"
                  editingSection={editingSection}
                  saving={sectionSaving}
                  onEdit={() => {
                    const initial = {};
                    sortedFamily.forEach(m => {
                      initial[`${m.role}_full_name`] = m.full_name ?? '';
                      initial[`${m.role}_occupation`] = m.occupation ?? '';
                      initial[`${m.role}_contact_no`] = m.contact_no ?? '';
                      initial[`${m.role}_relationship_to_student`] = m.relationship_to_student ?? '';
                    });
                    startEdit('family', initial);
                  }}
                  onSave={handleSaveFamily}
                  onCancel={cancelEdit}
                />
              )}
            </div>
            {editingSection === 'family' && sectionError && (
              <p className="adm-section-error">{sectionError}</p>
            )}

            {sortedFamily.length === 0 ? (
              <p className="adm-empty-note">No family members on file.</p>
            ) : editingSection === 'family' ? (
              <div className="adm-family-edit-list">
                {sortedFamily.map(m => (
                  <div className="adm-family-edit-row" key={m.family_member_id}>
                    <p className="adm-family-role-badge">{m.role}</p>
                    <div className="adm-info-grid">
                      <EditableField label="Name" value={draft[`${m.role}_full_name`]} onChange={v => updateDraft(`${m.role}_full_name`, v)} required />
                      <EditableField label="Occupation" value={draft[`${m.role}_occupation`]} onChange={v => updateDraft(`${m.role}_occupation`, v)} />
                      <EditableField
                        label="Contact No."
                        value={draft[`${m.role}_contact_no`]}
                        error={fieldErrors[`${m.role}_contact_no`]}
                        onChange={v => {
                          const digits = v.replace(/\D/g, '').slice(0, 11);
                          updateDraft(`${m.role}_contact_no`, digits);
                          setFieldErrors(prev => ({ ...prev, [`${m.role}_contact_no`]: validateMobile(digits) }));
                        }}
                      />
                      {m.role === 'Guardian' && (
                        <EditableField label="Relationship" value={draft[`${m.role}_relationship_to_student`]} onChange={v => updateDraft(`${m.role}_relationship_to_student`, v)} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="adm-sub-table-wrap">
                <table className="adm-sub-table">
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th>Name</th>
                      <th>Occupation</th>
                      <th>Contact No.</th>
                      {hasGuardianRow && <th>Relationship</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFamily.map((f, i) => (
                      <tr key={f.family_member_id ?? i}>
                        <td><span className="adm-family-role-badge">{f.role}</span></td>
                        <td>{f.full_name || '-'}</td>
                        <td>{f.occupation || '-'}</td>
                        <td>{f.contact_no || '-'}</td>
                        {hasGuardianRow && <td>{f.relationship_to_student || '-'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ════════════════════════════════════
              EMERGENCY CONTACT
              ════════════════════════════════════ */}
          <section className="adm-section">
            <div className="adm-section-header-row">
              <h3 className="adm-section-title">Emergency Contact</h3>
              <SectionEditControls
                sectionKey="emergency"
                editingSection={editingSection}
                saving={sectionSaving}
                onEdit={() => startEdit('emergency', {
                  emergency_name: enrollment.emergency_name ?? '',
                  emergency_relationship: enrollment.emergency_relationship ?? '',
                  emergency_contact_no: enrollment.emergency_contact_no ?? '',
                  emergency_address: enrollment.emergency_address ?? '',
                })}
                onSave={handleSaveEmergency}
                onCancel={cancelEdit}
              />
            </div>
            {editingSection === 'emergency' && sectionError && (
              <p className="adm-section-error">{sectionError}</p>
            )}
            <div className="adm-info-grid">
              {editingSection === 'emergency' ? (
                <>
                  <EditableField label="Name" value={draft.emergency_name} onChange={v => updateDraft('emergency_name', v)} required />
                  <EditableField label="Relationship" value={draft.emergency_relationship} onChange={v => updateDraft('emergency_relationship', v)} required />
                  <EditableField
                    label="Contact No."
                    value={draft.emergency_contact_no}
                    error={fieldErrors.emergency_contact_no}
                    onChange={v => {
                      const digits = v.replace(/\D/g, '').slice(0, 11);
                      updateDraft('emergency_contact_no', digits);
                      setFieldErrors(prev => ({ ...prev, emergency_contact_no: validateMobile(digits) }));
                    }}
                  />
                  <EditableField label="Address" value={draft.emergency_address} onChange={v => updateDraft('emergency_address', v)} required />
                </>
              ) : (
                <>
                  <InfoCard label="Name"           value={enrollment.emergency_name || '-'} />
                  <InfoCard label="Relationship"   value={enrollment.emergency_relationship || '-'} />
                  <InfoCard label="Contact No."    value={enrollment.emergency_contact_no || '-'} />
                  <InfoCard label="Address"        value={enrollment.emergency_address || '-'} />
                </>
              )}
            </div>
          </section>

          {/* ════════════════════════════════════
              HEALTH INFORMATION
              ════════════════════════════════════ */}
          <section className="adm-section">
            <div className="adm-section-header-row">
              <h3 className="adm-section-title">Health Information</h3>
              <SectionEditControls
                sectionKey="health"
                editingSection={editingSection}
                saving={sectionSaving}
                onEdit={() => startEdit('health', {
                  has_medical_condition: enrollment.has_medical_condition ?? 'none',
                  medical_condition_detail: enrollment.medical_condition_detail ?? '',
                  allergies: enrollment.allergies ?? '',
                  maintenance_medication: enrollment.maintenance_medication ?? '',
                })}
                onSave={handleSaveHealth}
                onCancel={cancelEdit}
              />
            </div>
            {editingSection === 'health' && sectionError && (
              <p className="adm-section-error">{sectionError}</p>
            )}
            <div className="adm-info-grid">
              {editingSection === 'health' ? (
                <>
                  <EditableField
                    label="Has Medical Condition"
                    type="select"
                    options={MEDICAL_OPTIONS}
                    value={draft.has_medical_condition}
                    required
                    onChange={v => {
                      updateDraft('has_medical_condition', v);
                      if (v !== 'yes') {
                        updateDraft('medical_condition_detail', '');
                        updateDraft('allergies', '');
                        updateDraft('maintenance_medication', '');
                      }
                    }}
                  />
                  <EditableField label="Condition Detail" value={draft.medical_condition_detail} onChange={v => updateDraft('medical_condition_detail', v)} disabled={draft.has_medical_condition !== 'yes'} />
                  <EditableField label="Allergies" value={draft.allergies} onChange={v => updateDraft('allergies', v)} disabled={draft.has_medical_condition !== 'yes'} />
                  <EditableField label="Maintenance Medication" value={draft.maintenance_medication} onChange={v => updateDraft('maintenance_medication', v)} disabled={draft.has_medical_condition !== 'yes'} />
                </>
              ) : (
                <>
                  <InfoCard
                    label="Has Medical Condition"
                    value={enrollment.has_medical_condition === 'yes' ? 'Yes' : 'None'}
                    copyable={false}
                  />
                  <InfoCard label="Condition Detail"  value={enrollment.medical_condition_detail || '-'} />
                  <InfoCard label="Allergies"          value={enrollment.allergies || '-'} />
                  <InfoCard label="Maintenance Medication" value={enrollment.maintenance_medication || '-'} />
                </>
              )}
            </div>
          </section>

          {/* ════════════════════════════════════
              SUBMITTED DOCUMENTS
              ════════════════════════════════════ */}
          <section className="adm-section">
            <h3 className="adm-section-title">
              Submitted Documents
              <span className="adm-section-count-inline">{docs.length}</span>
            </h3>
            {docError && <p className="adm-section-error">{docError}</p>}

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
                placeholder="Document type (e.g. Good Moral Certificate)"
                value={addDocType}
                onChange={e => setAddDocType(e.target.value)}
              />
              <input
                id="add-doc-file-input"
                key={addDocInputKey}
                type="file"
                accept="image/jpeg,image/png"
                style={{ display: 'none' }}
                onChange={e => setAddDocFile(e.target.files?.[0] ?? null)}
              />
              <label htmlFor="add-doc-file-input" className="adm-doc-replace-btn">
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
          <section className="adm-section">
            <h3 className="adm-section-title">
              Activity Logs
              <span className="adm-section-count-inline">{logs.length}</span>
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
              CONFIRM STATUS CHANGE MODAL & DELETE !!
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

          {/* ════════════════════════════════════
              ELECTIVES MODAL
              ════════════════════════════════════ */}
          {electivesModalOpen && (
            <div className="adm-modal-backdrop" onClick={() => setElectivesModalOpen(false)}>
              <div className="adm-modal-box" onClick={e => e.stopPropagation()}>
                <div className="adm-modal-header">
                  <span className="adm-modal-title">Electives</span>
                  <button className="adm-modal-close" onClick={() => setElectivesModalOpen(false)}>✕</button>
                </div>
                <p className="adm-modal-text">{enrollment.electives}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}