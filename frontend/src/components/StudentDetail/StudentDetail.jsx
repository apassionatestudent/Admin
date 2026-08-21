// => admin/components/StudentDetail/StudentDetail.jsx
// => Full detail view for a single student
// => Shows account info, full profile, and enrollment history
// => Styled to match tesdaEnrollmentDetail.jsx / shsEnrollmentDetail.jsx:
//    section-level Edit Mode (pencil -> inline fields -> Save/Cancel),
//    no modal. Account + Profile share one edit section because the PUT
//    endpoint validates and saves both together in a single call.

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
// => same toast library the public/student side already uses in Login.jsx
import toast from 'react-hot-toast';
import BackButton from '../BackButton/BackButton.jsx';
// => reusable yes/no dialog, guards the Deactivate/Activate Account button
import ConfirmModal from '../ConfirmModal/ConfirmModal.jsx';
// => Shared spinner/error block, replaces the local adm-student-detail-state markup below
import LoadingState from '../LoadingState/loadingState.jsx';
// => axiosAdmin auto-attaches credentials + x-csrf-token on every mutating
//    call - required or csrfProtection middleware silently rejects PATCH/PUT.
import axiosAdmin from '../../utils/axiosAdmin.js';

import './StudentDetail.css';

// icons
import clipboardIcon from '../../assets/icons/clipboard.png';
import checkMarkIcon from '../../assets/icons/checkmark.png';
import pencilIcon from '../../assets/icons/pencil.png';
// => Same chevron used by FacilityDetail/TrainerDetail/Support Tickets' Activity Log section
import chevronDown from '../../assets/icons/chevron-down.png';


// HELPERS


// => Derives display name from profile fields
const fullName = (row) => {
  const parts = [row.first_name, row.middle_name, row.last_name, row.name_extension]
    .filter(v => v && v.trim().toUpperCase() !== 'N/A');
  return parts.length ? parts.join(' ') : row.username ?? '-';
};

// => Handles both plain DATE strings and full ISO timestamps from pg driver
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  // => Slice to just the date part to avoid timezone shift
  const datePart = String(dateStr).slice(0, 10);
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
};

// => Formats ISO datetime with time component
const formatDateTime = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

// => Used by the Payment & Refund History section - this file never had
//    a currency formatter before that section was added.
const formatCurrency = (amount) => {
  if (amount == null) return '-';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
};

// => Sex display label - handles legacy 'm'/'f' rows as well as the new
//    full-word 'Male'/'Female' values so old records still render correctly
const sexLabel = (val) => {
  if (!val) return '-';
  const lower = val.toLowerCase();
  if (lower === 'm' || lower === 'male')   return 'Male';
  if (lower === 'f' || lower === 'female') return 'Female';
  return val;
};

// => Postgres DATE columns arrive as full ISO strings - slice to 10 chars
//    for <input type="date"> which needs exactly YYYY-MM-DD
const toDateInputValue = (dateStr) => (dateStr ? String(dateStr).slice(0, 10) : '');

const validateMobile = (value) => {
  if (!value) return 'Contact number is required.';
  if (!/^09\d{9}$/.test(value)) return 'Must start with 09 and be exactly 11 digits.';
  return null;
};

// => Age gate: student must be at least 12, no older than 100.
const MIN_STUDENT_AGE = 12;
const MAX_STUDENT_AGE = 100;

// => Computes the allowed <input type="date"> range for the age gate.
//    Called fresh on each render (not a module-level constant) so a
//    dashboard tab left open across midnight doesn't drift out of date.
const getAgeDateBounds = () => {
  const today = new Date();
  const toISO = (d) => d.toISOString().slice(0, 10);
  // => Oldest allowed birthdate = today minus MIN_STUDENT_AGE years
  const maxDate = new Date(today.getFullYear() - MIN_STUDENT_AGE, today.getMonth(), today.getDate());
  // => Youngest... i.e. furthest-back allowed birthdate = today minus MAX_STUDENT_AGE years
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
  if (age > MAX_STUDENT_AGE) return `Please check the birthdate - computed age exceeds ${MAX_STUDENT_AGE} years.`;
  return null;
};

// => Same EMAIL_REGEX/FACEBOOK_LINK_REGEX as TESDAStep1.jsx and
// => SHSStep1.jsx, so all three enforce identically since they all write
// => to the same student_profile.email / .facebook_link columns.
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const validateEmail = (value) => {
  if (!value) return 'Email is required.';
  if (!EMAIL_REGEX.test(value)) return 'Please enter a valid email address.';
  return null;
};

const FACEBOOK_LINK_REGEX = /^(https?:\/\/)?(www\.|web\.)?facebook\.com\/.+$/i;
const validateFacebookLink = (value) => {
  if (!value) return 'Facebook profile link is required.';
  if (!FACEBOOK_LINK_REGEX.test(value)) return 'Please enter a valid Facebook URL (e.g. https://www.facebook.com/yourname).';
  return null;
};

// => Generic "this can't be blank" check, for plain required text fields
// => that don't need a format check (Last Name, First Name)
const validateRequiredText = (label) => (value) => {
  if (!value || !value.trim()) return `${label} is required.`;
  return null;
};

// => Enrollment status badge CSS class map
const enrollmentStatusClass = {
  'Pending':             'status--pending',
  'Approved':            'status--approved',
  'Needs Clarification': 'status--clarification',
  'Rejected':            'status--rejected',
  'Dropped':             'status--dropped',
  'Completed':           'status--completed',
  'Reserved':            'status--reserved',
};

// => Class status badge CSS class map
const classStatusClass = {
  'Planned':   'status--planned',
  'Ongoing':   'status--ongoing',
  'Concluded': 'status--concluded',
};

// => Name extension options - matches NAME_EXTENSIONS in both TESDAStep1.jsx
//    and SHSStep1.jsx (SHS calls it "suffix", same list, same values)
const NAME_EXTENSION_OPTIONS = ['N/A', 'Jr.', 'Sr.', 'II', 'III', 'IV', 'V'];

// => Sex now stores/displays the full word, matching TESDA/SHS forms
const SEX_OPTIONS = ['Male', 'Female'];

// => civil_status, employment_status, highest_educ_attainment, and religion
// => are intentionally NOT handled on this page. civil_status/employment_
// => status/highest_educ_attainment are only ever collected by the TESDA
// => form, and religion is only ever collected by the SHS form - none of
// => them are universal account fields. tesda_enrollments / shs_enrollments
// => each hold their own copies, so they're edited on tesdaEnrollmentDetail
// => .jsx / shsEnrollmentDetail.jsx instead. See handleSaveAccountProfile
// => below for the draft object this page actually saves.


// REUSABLE UI PIECES (ported from tesdaEnrollmentDetail.jsx for style parity)


// => InfoCard - reusable read-only label+value cell with copy button
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

// => EditableField - the edit-mode counterpart to InfoCard.
// => type controls the input rendered: 'text' | 'email' | 'date' | 'select'
function EditableField({ label, value, onChange, type = 'text', options = null, error = null, disabled = false, required = false, min = undefined, max = undefined }) {
  const labelEl = (
    <p className="adm-info-label">
      {label}
      {required && <span className="adm-req-asterisk"> *</span>}
    </p>
  );

  if (type === 'select') {
    return (
      <div className="adm-info-card">
        {labelEl}
        <select
          className={`adm-edit-input ${error ? 'adm-edit-input--error' : ''}`}
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
        >
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
        // => min/max only meaningful for type="date" - undefined is a no-op
        //    on other input types, so safe to always pass through
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

// => BirthplaceCascadeFields - cascading Region -> Province -> City selector
//    for the edit-mode Personal Profile section. Mirrors the fetch pattern
//    from tesdaEnrollmentDetail.jsx's AddressCascadeFields, just without
//    a barangay step (birthplace only goes down to city).
function BirthplaceCascadeFields({ draft, updateDraft }) {
  const [regions,   setRegions]   = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [cities,    setCities]    = useState([]);

  const [loadingRegions,   setLoadingRegions]   = useState(false);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingCities,    setLoadingCities]    = useState(false);

  const regionCode   = draft.birthplace_region   ?? '';
  const provinceCode = draft.birthplace_province ?? '';
  const cityCode      = draft.birthplace_city     ?? '';

  const isNCR = regionCode === '1300000000';

  useEffect(() => {
    setLoadingRegions(true);
    fetch('/api/location/regions', { credentials: 'include' })
      .then(r => r.json())
      .then(setRegions)
      .catch(err => console.error('Failed to fetch regions:', err))
      .finally(() => setLoadingRegions(false));
  }, []);

  useEffect(() => {
    if (!regionCode) { setProvinces([]); setCities([]); return; }
    if (isNCR) {
      setLoadingCities(true);
      fetch(`/api/location/cities-by-region/${regionCode}`, { credentials: 'include' })
        .then(r => r.json()).then(setCities)
        .catch(err => console.error('Failed to fetch NCR cities:', err))
        .finally(() => setLoadingCities(false));
    } else {
      setLoadingProvinces(true);
      fetch(`/api/location/provinces/${regionCode}`, { credentials: 'include' })
        .then(r => r.json()).then(setProvinces)
        .catch(err => console.error('Failed to fetch provinces:', err))
        .finally(() => setLoadingProvinces(false));
    }
  }, [regionCode]);

  useEffect(() => {
    if (!provinceCode || isNCR) return;
    setLoadingCities(true);
    fetch(`/api/location/cities/${provinceCode}`, { credentials: 'include' })
      .then(r => r.json()).then(setCities)
      .catch(err => console.error('Failed to fetch cities:', err))
      .finally(() => setLoadingCities(false));
  }, [provinceCode]);

  return (
    <>
      <div className="adm-info-card">
        <p className="adm-info-label">
          Birthplace Region <span className="adm-req-asterisk">*</span>
        </p>
        <select
          className="adm-edit-input"
          value={regionCode}
          disabled={loadingRegions}
          onChange={e => {
            updateDraft('birthplace_region', e.target.value);
            updateDraft('birthplace_province', '');
            updateDraft('birthplace_city', '');
          }}
        >
          <option value="">{loadingRegions ? 'Loading…' : 'Select Region'}</option>
          {regions.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
        </select>
      </div>

      {!isNCR && (
        <div className="adm-info-card">
          <p className="adm-info-label">Birthplace Province</p>
          <select
            className="adm-edit-input"
            value={provinceCode}
            disabled={!regionCode || loadingProvinces}
            onChange={e => {
              updateDraft('birthplace_province', e.target.value);
              updateDraft('birthplace_city', '');
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
        <p className="adm-info-label">
          Birthplace City / Municipality <span className="adm-req-asterisk">*</span>
        </p>
        <select
          className="adm-edit-input"
          value={cityCode}
          disabled={(!provinceCode && !isNCR) || loadingCities}
          onChange={e => updateDraft('birthplace_city', e.target.value)}
        >
          <option value="">{loadingCities ? 'Loading…' : 'Select City / Municipality'}</option>
          {cities.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </div>
    </>
  );
}


// COMPONENT

export default function StudentDetail() {
  const { publicId } = useParams();
  const navigate     = useNavigate();

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // => Nationality options, fetched once on mount - same source TESDA uses
  const [nationalities, setNationalities] = useState([]);
  useEffect(() => {
    fetch('/api/reference/nationalities')
      .then(r => r.json())
      .then(setNationalities)
      .catch(err => console.error('Failed to fetch nationalities:', err));
  }, []);

  // => Toggle active state
  const [togglingActive, setTogglingActive] = useState(false);
  // => Controls the ConfirmModal shown before Deactivate/Activate Account
  //    actually runs, since this action changes login access immediately
  const [showToggleConfirm, setShowToggleConfirm] = useState(false);

  // => Reset Password - sends the student a reset link via email
  const [sendingResetLink, setSendingResetLink] = useState(false);
  const handleResetPassword = async () => {
    setSendingResetLink(true);

    try {
      const res = await axiosAdmin.post(`/api/admin/students/${publicId}/reset-password`);
      toast.success(`Reset link sent to ${res.data.email}.`);
      // => Refetch so the newly written log shows up immediately
      fetchLogs();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send reset link.');
    } finally {
      setSendingResetLink(false);
    }
  };

  // => Location resolved names for the READ VIEW (codes → readable names)
  const [locationNames, setLocationNames] = useState({
    region: '', province: '', city: '',
  });

  // 
  // EDIT MODE STATE
  // => Only one section editable at a time - editingSection holds that
  //    section's key ('accountProfile' | null). draft holds that
  //    section's in-progress field values.
  // 
  const [editingSection, setEditingSection] = useState(null);
  const [draft,          setDraft]          = useState({});
  const [sectionSaving,  setSectionSaving]  = useState(false);
  const [sectionError,   setSectionError]   = useState(null);
  const [fieldErrors,    setFieldErrors]    = useState({});

  // => Payment & Refund History - placeholder state for now, wired to a
  //    real fetch in Step 3 once the backend endpoint exists.
  const [paymentHistory, setPaymentHistory] = useState([]);

  // => Activity Logs state - matches FacilityDetail/TrainerDetail/Support
  //    Tickets exactly: fetch everything at once, no pagination,
  //    chevron-expandable rows.
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  // => Which log row is currently expanded to show its full action_detail
  const [expandedLogId, setExpandedLogId] = useState(null);
  // => Pagination, 10 per page, fetched fresh from the DB on every page change
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);

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

  
  // FETCH STUDENT DETAIL
  
  useEffect(() => {
    const fetchDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/students/${publicId}`, {
          credentials: 'include',
        });
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error || 'Failed to fetch student detail.');
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [publicId]);

  // => Payment & Refund History - separate fetch, own endpoint. Doesn't
  //    block the page's main loading state; failing silently here just
  //    leaves the section at its default empty array.
  useEffect(() => {
    if (!publicId) return;

    const fetchPaymentHistory = async () => {
      try {
        const res = await fetch(`/api/admin/students/${publicId}/payment-history`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const json = await res.json();
        setPaymentHistory(json.records ?? []);
      } catch (err) {
        console.error('Failed to fetch payment history:', err);
      }
    };

    fetchPaymentHistory();
  }, [publicId]);

  // => Activity Logs - separate fetch, own endpoint, same fetch-all-at-once
  //    pattern as Support Tickets/Facilities/Trainers. Called on mount and
  //    again after every successful save/toggle so a new log row shows up
  //    immediately.
  // => page defaults to 1 so calling fetchLogs() with no args (after a
  //    save/toggle) naturally lands back on the newest page
  const fetchLogs = async (page = 1) => {
    setLogsLoading(true);
    try {
      const res = await axiosAdmin.get(`/api/admin/students/${publicId}/logs`, {
        params: { page },
      });
      setLogs(res.data.logs || []);
      setLogsPage(res.data.page || page);
      setLogsTotalPages(res.data.totalPages || 1);
    } catch (err) {
      console.error('Failed to fetch student activity logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (!publicId) return;
    fetchLogs(1);
  }, [publicId]);

  
  // RESOLVE PSGC CODES → READABLE NAMES (read-only view)
  
  useEffect(() => {
    if (!data?.studentRow) return;
    const { birthplace_region, birthplace_province, birthplace_city } = data.studentRow;
    if (!birthplace_region) return;

    const resolve = async () => {
      const names = { region: '', province: '', city: '' };
      try {
        // => Step 1: match stored PSGC code against regions list
        const regRes = await fetch('/api/location/regions', { credentials: 'include' });
        if (regRes.ok) {
          const allRegions = await regRes.json();
          const match = allRegions.find(r =>
            birthplace_region === r.code ||
            birthplace_region.startsWith(r.code) ||
            r.code.startsWith(birthplace_region)
          );
          names.region = match?.name ?? birthplace_region;
        }

        // => Step 2: Province (skip for NCR which has no province)
        if (birthplace_province) {
          const provRes = await fetch(`/api/location/provinces/${birthplace_region}`, { credentials: 'include' });
          if (provRes.ok) {
            const allProvs = await provRes.json();
            const match = allProvs.find(p => p.code === birthplace_province);
            names.province = match?.name ?? birthplace_province;
          }
        }

        // => Step 3: City / Municipality
        if (birthplace_city) {
          // => NCR has no province so fetch cities by region instead
          const endpoint = birthplace_province
            ? `/api/location/cities/${birthplace_province}`
            : `/api/location/cities-by-region/${birthplace_region}`;
          const cityRes = await fetch(endpoint, { credentials: 'include' });
          if (cityRes.ok) {
            const allCities = await cityRes.json();
            const match = allCities.find(c => c.code === birthplace_city);
            names.city = match?.name ?? birthplace_city;
          }
        }

        setLocationNames(names);
      } catch {
        // => Non-critical; raw codes will show as fallback
        setLocationNames({
          region:   birthplace_region   ?? '',
          province: birthplace_province ?? '',
          city:     birthplace_city     ?? '',
        });
      }
    };

    resolve();
  }, [data]);

  
  // TOGGLE is_active
  
  // => Runs the actual PATCH once the admin confirms in the modal, the
  //    button itself no longer calls this directly
  const handleToggleActive = async () => {
    if (!data) return;
    const newValue = !data.studentRow.is_active;

    setShowToggleConfirm(false);
    setTogglingActive(true);

    try {
      const res = await axiosAdmin.patch(`/api/admin/students/${publicId}/active`, {
        is_active: newValue,
      });

      setData(prev => ({
        ...prev,
        studentRow: { ...prev.studentRow, is_active: res.data.updated.is_active },
      }));
      toast.success(`Account ${newValue ? 'activated' : 'deactivated'} successfully.`);
      // => Refetch so the newly written log shows up immediately
      fetchLogs();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update status.');
    } finally {
      setTogglingActive(false);
    }
  };

  
  // SAVE ACCOUNT + PROFILE (single section, single PUT call)
  
  const handleSaveAccountProfile = async () => {
    // => Re-validate every field on save, in case one was never touched
    //    (so its error never got set by an onChange handler)
    const errors = {
      contact_no:     validateMobile(draft.contact_no),
      birth_date:     validateAge(draft.birth_date),
      last_name:      validateRequiredText('Last Name')(draft.last_name),
      first_name:     validateRequiredText('First Name')(draft.first_name),
      email:          validateEmail(draft.email),
      facebook_link:  validateFacebookLink(draft.facebook_link),
    };
    if (Object.values(errors).some(Boolean)) {
      setFieldErrors(prev => ({ ...prev, ...errors }));
      setSectionError('Please fix the highlighted fields before saving.');
      return;
    }
    if (Object.values(fieldErrors).some(Boolean)) {
      setSectionError('Please fix the highlighted fields before saving.');
      return;
    }
    setSectionSaving(true);
    setSectionError(null);
    try {
      const res = await axiosAdmin.put(`/api/admin/students/${publicId}`, draft);
      setData(prev => ({
        ...prev,
        studentRow: {
          ...prev.studentRow,
          ...res.data.updatedProfile,
          ...(res.data.updatedAccount ?? {}),
        },
      }));
      cancelEdit();
      // => Refetch so the newly written log shows up immediately
      fetchLogs();
    } catch (err) {
      setSectionError(err.response?.data?.error || 'Failed to save changes.');
    } finally {
      setSectionSaving(false);
    }
  };

  
  // RENDER STATES
  
  // => Swapped local adm-student-detail-state spinner/warning markup for
  //    the shared LoadingState component, same variant pattern used elsewhere
  if (loading) {
    return (
      <div className="adm-student-detail-page">
        <LoadingState message="Loading student record…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="adm-student-detail-page">
        <BackButton destination="Students" onClick={() => navigate('/dashboard/students')} />
        <LoadingState variant="error" message={error} />
      </div>
    );
  }

  const { studentRow, enrollments } = data;

  
  // MAIN RENDER
  
  return (
    <div className="adm-student-detail-page">

      {/* Back button */}
      <BackButton destination="Students" onClick={() => navigate('/dashboard/students')} />

      <div className="adm-student-detail-body">

        {/* ════════════════════════════════════
            HERO HEADER
            ════════════════════════════════════ */}
        <div className="adm-student-hero">
          <div className="adm-hero-left">
            <h1 className="adm-hero-name">{fullName(studentRow)}</h1>
            <p className="adm-hero-email">{studentRow.username}</p>
          </div>

          <span className={`adm-hero-badge ${studentRow.is_active ? 'status--active' : 'status--inactive'}`}>
            {studentRow.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>

        {/* ════════════════════════════════════
            ACCOUNT ACTIONS
            ════════════════════════════════════ */}
        <div className="adm-student-section">
          <p className="adm-section-title">Account Actions</p>
          <div className="adm-actions-row">

            <button
              className={`adm-action-btn ${studentRow.is_active ? 'adm-action-btn--danger' : 'adm-action-btn--success'}`}
              onClick={() => setShowToggleConfirm(true)}
              disabled={togglingActive}
            >
              {togglingActive
                ? 'Updating…'
                : studentRow.is_active ? 'Deactivate Account' : 'Activate Account'
              }
            </button>

            {/* => Confirms before flipping is_active, since this
                 immediately blocks or restores the student's login */}
            <ConfirmModal
              isOpen={showToggleConfirm}
              message={
                studentRow.is_active
                  ? 'Are you sure you want to deactivate this account? The student will not be able to log in until reactivated.'
                  : 'Are you sure you want to activate this account? The student will be able to log in again.'
              }
              onConfirm={handleToggleActive}
              onCancel={() => setShowToggleConfirm(false)}
            />

            {/* => Reset Password - emails the student a reset link, uses
                 the same set-password page the enrollment flow uses */}
            <button
              className="adm-action-btn adm-action-btn--secondary"
              onClick={handleResetPassword}
              disabled={sendingResetLink}
            >
              {sendingResetLink ? 'Sending…' : 'Reset Password'}
            </button>


          </div>
        </div>

        {/* ════════════════════════════════════
            ACCOUNT INFO (read-only bits that never change here)
            ════════════════════════════════════ */}
        <div className="adm-student-section">
          <p className="adm-section-title">Account Information</p>
          <div className="adm-info-grid">

            <div className="adm-info-card">
              <p className="adm-info-label">Registered</p>
              <p className="adm-info-value">{formatDateTime(studentRow.created_at)}</p>
            </div>

            <div className="adm-info-card">
              <p className="adm-info-label">Last Login</p>
              <p className="adm-info-value">{formatDateTime(studentRow.last_login_at)}</p>
            </div>

            <div className="adm-info-card">
              <p className="adm-info-label">Last Updated</p>
              <p className="adm-info-value">{formatDateTime(studentRow.updated_at)}</p>
            </div>

          </div>
        </div>

        {/* ════════════════════════════════════
            ACCOUNT & PERSONAL PROFILE
            => One edit section - the PUT endpoint saves account + profile
               fields together in a single call, so they share one
               pencil / Save / Cancel control.
            ════════════════════════════════════ */}
        <div className="adm-student-section">
          <div className="adm-section-header-row">
            <p className="adm-section-title" style={{ margin: 0 }}>Account &amp; Personal Profile</p>
            <SectionEditControls
              sectionKey="accountProfile"
              editingSection={editingSection}
              saving={sectionSaving}
              onEdit={() => startEdit('accountProfile', {
                // => Account fields
                username:                studentRow.username                ?? '',
                // => Profile fields - civil_status, employment_status,
                //    highest_educ_attainment, religion, and religion_others
                //    are deliberately excluded from this draft. They're
                //    enrollment-form-specific and edited on
                //    tesdaEnrollmentDetail.jsx / shsEnrollmentDetail.jsx.
                last_name:               studentRow.last_name               ?? '',
                first_name:              studentRow.first_name              ?? '',
                middle_name:             studentRow.middle_name             ?? '',
                name_extension:          studentRow.name_extension          || 'N/A',
                sex:                     sexLabel(studentRow.sex) !== '-' ? sexLabel(studentRow.sex) : '',
                birth_date:              toDateInputValue(studentRow.birth_date),
                nationality:             studentRow.nationality             ?? '',
                birthplace_region:       studentRow.birthplace_region       ?? '',
                birthplace_province:     studentRow.birthplace_province     ?? '',
                birthplace_city:         studentRow.birthplace_city         ?? '',
                facebook_link:           studentRow.facebook_link           ?? '',
                email:                   studentRow.email                   ?? '',
                contact_no:              studentRow.contact_no              ?? '',
              })}
              onSave={handleSaveAccountProfile}
              onCancel={cancelEdit}
            />
          </div>

          {editingSection === 'accountProfile' && sectionError && (
            <p className="adm-section-error">{sectionError}</p>
          )}

          {!studentRow.profile_id && editingSection !== 'accountProfile' ? (
            <p className="adm-empty-note">No profile submitted yet.</p>
          ) : (
            <div className="adm-info-grid">
              {editingSection === 'accountProfile' ? (
                <>
                  {/* Account fields */}
                  <EditableField
                    label="Email / Username"
                    type="email"
                    value={draft.username}
                    required
                    onChange={v => updateDraft('username', v)}
                  />

                  {/* Profile fields */}
                  <EditableField
                    label="Last Name"
                    value={draft.last_name}
                    error={fieldErrors.last_name}
                    required
                    onChange={v => {
                      updateDraft('last_name', v);
                      setFieldErrors(prev => ({ ...prev, last_name: validateRequiredText('Last Name')(v) }));
                    }}
                  />
                  <EditableField
                    label="First Name"
                    value={draft.first_name}
                    error={fieldErrors.first_name}
                    required
                    onChange={v => {
                      updateDraft('first_name', v);
                      setFieldErrors(prev => ({ ...prev, first_name: validateRequiredText('First Name')(v) }));
                    }}
                  />
                  <EditableField label="Middle Name" value={draft.middle_name} onChange={v => updateDraft('middle_name', v)} />
                  <EditableField
                    label="Name Extension"
                    type="select"
                    options={NAME_EXTENSION_OPTIONS}
                    value={draft.name_extension}
                    onChange={v => updateDraft('name_extension', v)}
                  />
                  <EditableField
                    label="Sex"
                    type="select"
                    options={SEX_OPTIONS}
                    value={draft.sex}
                    onChange={v => updateDraft('sex', v)}
                    required
                  />
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
                  <EditableField
                    label="Nationality"
                    type="select"
                    options={nationalities}
                    value={draft.nationality}
                    onChange={v => updateDraft('nationality', v)}
                    required
                  />

                  <BirthplaceCascadeFields draft={draft} updateDraft={updateDraft} />

                  {/* => civil_status, highest_educ_attainment, employment_status,
                       religion/religion_others removed - edited on the
                       enrollment-specific detail pages instead */}
                  <EditableField
                    label="Facebook Link"
                    value={draft.facebook_link}
                    error={fieldErrors.facebook_link}
                    required
                    onChange={v => {
                      updateDraft('facebook_link', v);
                      setFieldErrors(prev => ({ ...prev, facebook_link: validateFacebookLink(v) }));
                    }}
                  />
                  <EditableField
                    label="Email"
                    type="email"
                    value={draft.email}
                    error={fieldErrors.email}
                    required
                    onChange={v => {
                      updateDraft('email', v);
                      setFieldErrors(prev => ({ ...prev, email: validateEmail(v) }));
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
                </>
              ) : (
                <>
                  {/* Account fields */}
                  <InfoCard label="Email / Username" value={studentRow.username ?? '-'} />

                  {/* Profile fields */}
                  <InfoCard label="Last Name" value={studentRow.last_name ?? '-'} />
                  <InfoCard label="First Name" value={studentRow.first_name ?? '-'} />
                  <InfoCard label="Middle Name" value={studentRow.middle_name ?? '-'} />
                  <InfoCard label="Name Extension" value={studentRow.name_extension ?? '-'} />
                  <InfoCard label="Sex" value={sexLabel(studentRow.sex)} />
                  <InfoCard label="Birthdate" value={formatDate(studentRow.birth_date)} />
                  <InfoCard label="Nationality" value={studentRow.nationality ?? '-'} />
                  <InfoCard label="Birthplace (Region)" value={locationNames.region || studentRow.birthplace_region || '-'} />
                  {(locationNames.province || studentRow.birthplace_province) && (
                    <InfoCard label="Birthplace (Province)" value={locationNames.province || studentRow.birthplace_province} />
                  )}
                  <InfoCard label="Birthplace (City / Municipality)" value={locationNames.city || studentRow.birthplace_city || '-'} />
                  {/* => civil_status, highest_educ_attainment, employment_status,
                       religion removed - view them on the student's individual
                       enrollment record instead (Enrollment History below) */}
                  <InfoCard label="Facebook Link" value={studentRow.facebook_link ?? '-'} />
                  <InfoCard label="Email" value={studentRow.email ?? '-'} />
                  <InfoCard label="Contact No." value={studentRow.contact_no ?? '-'} />
                </>
              )}
            </div>
          )}
        </div>

        {/* ════════════════════════════════════
            ENROLLMENT HISTORY
            ════════════════════════════════════ */}
        <div className="adm-student-section">
          <p className="adm-section-title">
            Enrollment History
            <span className="adm-section-count-inline">{enrollments?.length ?? 0}</span>
          </p>

          {!enrollments || enrollments.length === 0 ? (
            <p className="adm-empty-note">No enrollment records found for this student.</p>
          ) : (
            <div className="adm-sub-table-wrap">
              <table className="adm-sub-table">
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Class Dates</th>
                    <th>Class Status</th>
                    <th>Enrollment Status</th>
                    <th>Submitted</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map((e) => (
                    <tr
                      key={e.enrollment_public_id}
                      className="adm-sub-table-row"
                      onClick={() => navigate(`/dashboard/enrollments/${e.enrollment_public_id}`)}
                      title="View enrollment detail"
                    >
                      <td className="adm-td-course">{e.course_name ?? '-'}</td>
                      <td className="adm-td-dates">
                        {e.start_date
                          ? `${String(e.start_date).slice(0,10)} - ${String(e.end_date).slice(0,10)}`
                          : '-'
                        }
                      </td>
                      <td>
                        <span className={`adm-badge ${classStatusClass[e.class_status] || ''}`}>
                          {e.class_status}
                        </span>
                      </td>
                      <td>
                        <span className={`adm-badge ${enrollmentStatusClass[e.enrollment_status] || ''}`}>
                          {e.enrollment_status}
                        </span>
                      </td>
                      <td className="adm-td-date">
                        {e.submitted_at
                          ? new Date(e.submitted_at).toLocaleDateString('en-PH', {
                              year: 'numeric', month: 'short', day: 'numeric',
                            })
                          : '-'
                        }
                      </td>
                      <td className="adm-td-arrow">›</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          </div>

        {/* ════════════════════════════════════
            PAYMENT & REFUND HISTORY (read-only)
            => Lifetime ledger across both TESDA and SHS enrollments for
               this student.
            ════════════════════════════════════ */}
        <div className="adm-student-section">
          <p className="adm-section-title">
            Payment & Refund History
            <span className="adm-section-count-inline">{paymentHistory.length}</span>
          </p>

          {paymentHistory.length === 0 ? (
            <p className="adm-empty-note">No payments or refunds recorded for this student.</p>
          ) : (
            <div className="adm-sub-table-wrap">
              <table className="adm-sub-table">
                <thead>
                  <tr>
                    <th>Program</th>
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
                        <span className={`adm-type-badge adm-type-badge--${record.program_type.toLowerCase()}`}>
                          {record.program_type}
                        </span>
                      </td>
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

          </div>

        {/* ════════════════════════════════════
            ACTIVITY LOG
            => Real data, fetch-all-at-once, chevron-expandable rows,
               matches FacilityDetail/TrainerDetail/Support Tickets
               pattern. entity_type = 'student', entity_id = internal
               student_id (not the public_id).
            ════════════════════════════════════ */}
        <div className="adm-student-section">
          <p className="adm-section-title">
            Activity Log
            <span className="adm-section-count-inline">{logs.length}</span>
          </p>

          {logsLoading && <p className="adm-empty-note">Loading logs…</p>}

          {!logsLoading && logs.length === 0 && (
            <p className="adm-empty-note">No activity recorded for this student yet.</p>
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
                  {logs.map(log => {
                    const isExpanded = expandedLogId === log.log_id;
                    return (
                      <React.Fragment key={log.log_id}>
                        <tr
                          className="adm-log-row"
                          onClick={() => setExpandedLogId(isExpanded ? null : log.log_id)}
                        >
                          <td className="adm-td-date">{formatDateTime(log.created_at)}</td>
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

          {!logsLoading && logs.length > 0 && (
            <div className="adm-log-pagination">
              <button
                className="adm-log-page-btn"
                onClick={() => fetchLogs(logsPage - 1)}
                disabled={logsPage <= 1}
              >
                {/* => Prev button, disabled on page 1 */}
                Prev
              </button>

              <span className="adm-log-page-indicator">
                Page {logsPage} of {logsTotalPages}
              </span>

              <button
                className="adm-log-page-btn"
                onClick={() => fetchLogs(logsPage + 1)}
                disabled={logsPage >= logsTotalPages}
              >
                {/* => Next button, disabled on the last page */}
                Next
              </button>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
