// => admin/components/StudentDetail/StudentDetail.jsx
// => Full detail view for a single student
// => Shows account info, full profile, and enrollment history
// => Mirrors ClassDetail.jsx pattern

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import BackButton from '../BackButton/BackButton.jsx';

import './StudentDetail.css';


// HELPERS


// => Derives display name from profile fields
const fullName = (row) => {
  const parts = [row.first_name, row.middle_name, row.surname, row.name_extension]
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

// => Sex display label (DB stores 'm' / 'f')
const sexLabel = (val) => {
  if (!val) return '-';
  return val.toLowerCase() === 'm' ? 'Male' : val.toLowerCase() === 'f' ? 'Female' : val;
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

// => Name extension options for the dropdown
// => 'N/A' is the default when no extension applies
const NAME_EXTENSION_OPTIONS = ['N/A', 'Jr.', 'Sr.', 'II', 'III', 'IV'];


// EDIT FORM INITIAL STATE
// => Built from a studentRow so the form is pre-filled

const buildFormState = (row) => ({
  // => Profile fields
  uli:                            row.uli                            ?? '',
  surname:                        row.surname                        ?? '',
  first_name:                     row.first_name                     ?? '',
  middle_name:                    row.middle_name                    ?? '',
  // => Default to 'N/A' if blank so dropdown has a valid selection
  name_extension:                 row.name_extension                 || 'N/A',
  mother_name:                    row.mother_name                    ?? '',
  father_name:                    row.father_name                    ?? '',
  birthdate:                      row.birthdate ? String(row.birthdate).slice(0, 10) : '',
  // => Store PSGC codes internally; dropdowns resolve to names for display
  birthplace_region:              row.birthplace_region              ?? '',
  birthplace_province:            row.birthplace_province            ?? '',
  birthplace_city_or_municipality: row.birthplace_city_or_municipality ?? '',
  nationality:                    row.nationality                    ?? '',
  sex:                            row.sex                            ?? '',
  civil_status:                   row.civil_status                   ?? '',
  highest_educational_attainment: row.highest_educational_attainment ?? '',
  employment_status:              row.employment_status              ?? '',
  client_type:                    row.client_type                    ?? '',
  // => Account fields
  username:                       row.username                       ?? '',
  is_email_confirmed:             row.is_email_confirmed             ?? false,
});


// COMPONENT

export default function StudentDetail() {
  const { publicId } = useParams();
  const navigate     = useNavigate();

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // => Toggle active state
  const [togglingActive, setTogglingActive] = useState(false);
  const [toggleMsg,      setToggleMsg]      = useState(null); // => { type, text }

  // => Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [formState,     setFormState]     = useState(null);
  const [formError,     setFormError]     = useState('');
  const [formSaving,    setFormSaving]    = useState(false);
  const [formSuccess,   setFormSuccess]   = useState('');

  // => Location resolved names for the READ VIEW (codes → readable names)
  const [locationNames, setLocationNames] = useState({
    region: '', province: '', city: '',
  });

  
  // CASCADING DROPDOWN DATA FOR THE EDIT MODAL
  // => Mirrors EnrollmentDetail.jsx / student registration pattern
  
  const [regions,    setRegions]    = useState([]);   // => [{ code, name }]
  const [provinces,  setProvinces]  = useState([]);   // => populated when region changes
  const [cities,     setCities]     = useState([]);   // => populated when province changes (or region for NCR)
  const [loadingRegions,   setLoadingRegions]   = useState(false);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingCities,    setLoadingCities]    = useState(false);

  
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
        setFormState(buildFormState(json.studentRow));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [publicId]);

  
  // RESOLVE PSGC CODES → READABLE NAMES (read-only view)
  // => Same step-by-step resolution used in EnrollmentDetail
  
  useEffect(() => {
    if (!data?.studentRow) return;
    const { birthplace_region, birthplace_province, birthplace_city_or_municipality } = data.studentRow;
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
        if (birthplace_city_or_municipality) {
          // => NCR has no province so fetch cities by region instead
          const endpoint = birthplace_province
            ? `/api/location/cities/${birthplace_province}`
            : `/api/location/cities-by-region/${birthplace_region}`;
          const cityRes = await fetch(endpoint, { credentials: 'include' });
          if (cityRes.ok) {
            const allCities = await cityRes.json();
            const match = allCities.find(c => c.code === birthplace_city_or_municipality);
            names.city = match?.name ?? birthplace_city_or_municipality;
          }
        }

        setLocationNames(names);
      } catch {
        // => Non-critical; raw codes will show as fallback
        setLocationNames({
          region:   birthplace_region                  ?? '',
          province: birthplace_province                ?? '',
          city:     birthplace_city_or_municipality    ?? '',
        });
      }
    };

    resolve();
  }, [data]);

  
  // LOAD REGIONS WHEN EDIT MODAL OPENS
  // => Only fetch once; subsequent opens reuse the same list
  
  useEffect(() => {
    if (!showEditModal) return;
    if (regions.length > 0) return; // => already loaded

    const fetchRegions = async () => {
      setLoadingRegions(true);
      try {
        const res = await fetch('/api/location/regions', { credentials: 'include' });
        if (res.ok) setRegions(await res.json());
      } finally {
        setLoadingRegions(false);
      }
    };

    fetchRegions();
  }, [showEditModal]);

  
  // LOAD PROVINCES WHEN REGION CHANGES IN MODAL
  // => Also triggers the initial pre-fill when the modal first opens
  
  useEffect(() => {
    if (!showEditModal) return;
    if (!formState?.birthplace_region) {
      setProvinces([]);
      setCities([]);
      return;
    }

    const fetchProvinces = async () => {
      setLoadingProvinces(true);
      setProvinces([]);
      setCities([]);
      try {
        const res = await fetch(`/api/location/provinces/${formState.birthplace_region}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setProvinces(data);
          // => If no provinces returned (NCR), load cities directly by region
          if (data.length === 0) {
            fetchCitiesByRegion(formState.birthplace_region);
          }
        }
      } finally {
        setLoadingProvinces(false);
      }
    };

    fetchProvinces();
  }, [formState?.birthplace_region, showEditModal]);

  
  // LOAD CITIES WHEN PROVINCE CHANGES IN MODAL
  
  useEffect(() => {
    if (!showEditModal) return;
    if (!formState?.birthplace_province) return;

    const fetchCities = async () => {
      setLoadingCities(true);
      setCities([]);
      try {
        const res = await fetch(`/api/location/cities/${formState.birthplace_province}`, { credentials: 'include' });
        if (res.ok) setCities(await res.json());
      } finally {
        setLoadingCities(false);
      }
    };

    fetchCities();
  }, [formState?.birthplace_province, showEditModal]);

  // => Helper: fetch cities directly by region (NCR case)
  const fetchCitiesByRegion = async (regionCode) => {
    setLoadingCities(true);
    setCities([]);
    try {
      const res = await fetch(`/api/location/cities-by-region/${regionCode}`, { credentials: 'include' });
      if (res.ok) setCities(await res.json());
    } finally {
      setLoadingCities(false);
    }
  };

  
  // TOGGLE is_active
  
  const handleToggleActive = async () => {
    if (!data) return;
    const newValue = !data.studentRow.is_active;

    setTogglingActive(true);
    setToggleMsg(null);

    try {
      const res = await fetch(`/api/admin/students/${publicId}/active`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_active: newValue }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to update status.');

      setData(prev => ({
        ...prev,
        studentRow: { ...prev.studentRow, is_active: body.updated.is_active },
      }));
      setToggleMsg({ type: 'success', text: `Account ${newValue ? 'activated' : 'deactivated'} successfully.` });
    } catch (err) {
      setToggleMsg({ type: 'error', text: err.message });
    } finally {
      setTogglingActive(false);
    }
  };

  
  // EDIT FORM HANDLERS
  
  const handleFormChange = (field, value) => {
    setFormState(prev => {
      const next = { ...prev, [field]: value };

      // => Cascading reset: changing region clears province and city
      if (field === 'birthplace_region') {
        next.birthplace_province            = '';
        next.birthplace_city_or_municipality = '';
      }
      // => Changing province clears city
      if (field === 'birthplace_province') {
        next.birthplace_city_or_municipality = '';
      }

      return next;
    });
    setFormError('');
    setFormSuccess('');
  };

  const handleOpenEdit = () => {
    setFormState(buildFormState(data.studentRow));
    setFormError('');
    setFormSuccess('');
    // => Reset cascading dropdown data so they reload fresh from current codes
    setProvinces([]);
    setCities([]);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    setFormError('');
    setFormSuccess('');
    setFormSaving(true);

    try {
      const res = await fetch(`/api/admin/students/${publicId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formState),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to save changes.');

      // => Merge returned fields back into local data
      setData(prev => ({
        ...prev,
        studentRow: {
          ...prev.studentRow,
          ...body.updatedProfile,
          ...(body.updatedAccount ?? {}),
        },
      }));

      setFormSuccess('Changes saved successfully.');
      // => Auto-close modal after short delay
      setTimeout(() => setShowEditModal(false), 1200);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setFormSaving(false);
    }
  };

  
  // RENDER STATES
  
  if (loading) {
    return (
      <div className="adm-student-detail-page">
        <div className="adm-student-detail-state">
          <div className="adm-spinner" />
          <p>Loading student record…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="adm-student-detail-page">
        <BackButton destination="Students" onClick={() => navigate('/dashboard/students')} />
        <div className="adm-student-detail-state adm-student-detail-state--error">
          <span>⚠ {error}</span>
        </div>
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
            {studentRow.uli && (
              <p className="adm-hero-uli">ULI: {studentRow.uli}</p>
            )}
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
              onClick={handleToggleActive}
              disabled={togglingActive}
            >
              {togglingActive
                ? 'Updating…'
                : studentRow.is_active ? 'Deactivate Account' : 'Activate Account'
              }
            </button>

            <button
              className="adm-action-btn adm-action-btn--primary"
              onClick={handleOpenEdit}
            >
              Edit Student Record
            </button>

            {toggleMsg && (
              <span className={`adm-save-msg adm-save-msg--${toggleMsg.type}`}>
                {toggleMsg.text}
              </span>
            )}
          </div>
        </div>

        {/* ════════════════════════════════════
            ACCOUNT INFO
            ════════════════════════════════════ */}
        <div className="adm-student-section">
          <p className="adm-section-title">Account Information</p>
          <div className="adm-info-grid">

            <div className="adm-info-card">
              <p className="adm-info-label">Email / Username</p>
              <p className="adm-info-value">{studentRow.username}</p>
            </div>

            <div className="adm-info-card">
              <p className="adm-info-label">Email Confirmed</p>
              <p className="adm-info-value">
                <span className={`adm-badge ${studentRow.is_email_confirmed ? 'status--active' : 'status--inactive'}`}>
                  {studentRow.is_email_confirmed ? 'Confirmed' : 'Unconfirmed'}
                </span>
              </p>
            </div>

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
            PERSONAL PROFILE
            ════════════════════════════════════ */}
        <div className="adm-student-section">
          <p className="adm-section-title">Personal Profile</p>

          {!studentRow.profile_id ? (
            <p className="adm-empty-note">No profile submitted yet.</p>
          ) : (
            <div className="adm-info-grid">

              <div className="adm-info-card">
                <p className="adm-info-label">ULI</p>
                <p className="adm-info-value">{studentRow.uli ?? '-'}</p>
              </div>

              <div className="adm-info-card">
                <p className="adm-info-label">Surname</p>
                <p className="adm-info-value">{studentRow.surname ?? '-'}</p>
              </div>

              <div className="adm-info-card">
                <p className="adm-info-label">First Name</p>
                <p className="adm-info-value">{studentRow.first_name ?? '-'}</p>
              </div>

              <div className="adm-info-card">
                <p className="adm-info-label">Middle Name</p>
                <p className="adm-info-value">{studentRow.middle_name ?? '-'}</p>
              </div>

              <div className="adm-info-card">
                <p className="adm-info-label">Name Extension</p>
                <p className="adm-info-value">{studentRow.name_extension ?? '-'}</p>
              </div>

              <div className="adm-info-card">
                <p className="adm-info-label">Sex</p>
                <p className="adm-info-value">{sexLabel(studentRow.sex)}</p>
              </div>

              <div className="adm-info-card">
                <p className="adm-info-label">Birthdate</p>
                <p className="adm-info-value">{formatDate(studentRow.birthdate)}</p>
              </div>

              <div className="adm-info-card">
                <p className="adm-info-label">Civil Status</p>
                <p className="adm-info-value">{studentRow.civil_status ?? '-'}</p>
              </div>

              <div className="adm-info-card">
                <p className="adm-info-label">Nationality</p>
                <p className="adm-info-value">{studentRow.nationality ?? '-'}</p>
              </div>

              <div className="adm-info-card">
                <p className="adm-info-label">Birthplace (Region)</p>
                <p className="adm-info-value">{locationNames.region || studentRow.birthplace_region || '-'}</p>
              </div>

              {(locationNames.province || studentRow.birthplace_province) && (
                <div className="adm-info-card">
                  <p className="adm-info-label">Birthplace (Province)</p>
                  <p className="adm-info-value">{locationNames.province || studentRow.birthplace_province}</p>
                </div>
              )}

              <div className="adm-info-card">
                <p className="adm-info-label">Birthplace (City / Municipality)</p>
                <p className="adm-info-value">{locationNames.city || studentRow.birthplace_city_or_municipality || '-'}</p>
              </div>

              <div className="adm-info-card">
                <p className="adm-info-label">Mother's Name</p>
                <p className="adm-info-value">{studentRow.mother_name ?? '-'}</p>
              </div>

              <div className="adm-info-card">
                <p className="adm-info-label">Father's Name</p>
                <p className="adm-info-value">{studentRow.father_name ?? '-'}</p>
              </div>

              <div className="adm-info-card">
                <p className="adm-info-label">Highest Education</p>
                <p className="adm-info-value">{studentRow.highest_educational_attainment ?? '-'}</p>
              </div>

              <div className="adm-info-card">
                <p className="adm-info-label">Employment Status</p>
                <p className="adm-info-value">{studentRow.employment_status ?? '-'}</p>
              </div>

              <div className="adm-info-card">
                <p className="adm-info-label">Client Type</p>
                <p className="adm-info-value">{studentRow.client_type ?? '-'}</p>
              </div>

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
                    <th>Branch</th>
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
                      <td className="adm-td-branch">{e.branch_name ?? '-'}</td>
                      <td className="adm-td-dates">
                        {e.start_date
                          ? `${String(e.start_date).slice(0,10)} – ${String(e.end_date).slice(0,10)}`
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

      </div>

      {/* ════════════════════════════════════
          EDIT MODAL
          ════════════════════════════════════ */}
      {showEditModal && formState && (
        <div
          className="adm-modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget && !formSaving) setShowEditModal(false); }}
        >
          <div className="adm-modal-box adm-modal-box--form">

            <div className="adm-modal-header">
              <span className="adm-modal-title">Edit Student Record</span>
              <button
                className="adm-modal-close"
                onClick={() => setShowEditModal(false)}
                disabled={formSaving}
              >
                ✕
              </button>
            </div>

            <div className="adm-modal-body">

              {/* ── Account fields ── */}
              <p className="adm-form-section-label">Account</p>

              <div className="adm-form-row">
                <div className="adm-form-group">
                  <label className="adm-form-label">
                    Email / Username <span className="adm-form-required">*</span>
                  </label>
                  <input
                    className="adm-form-input"
                    type="email"
                    value={formState.username}
                    onChange={e => handleFormChange('username', e.target.value)}
                  />
                </div>

                <div className="adm-form-group">
                  <label className="adm-form-label">Email Confirmed</label>
                  <select
                    className="adm-form-select"
                    value={String(formState.is_email_confirmed)}
                    onChange={e => handleFormChange('is_email_confirmed', e.target.value === 'true')}
                  >
                    <option value="true">Yes – Confirmed</option>
                    <option value="false">No – Unconfirmed</option>
                  </select>
                </div>
              </div>

              {/* ── Profile fields ── */}
              <p className="adm-form-section-label">Profile</p>

              <div className="adm-form-group">
                <label className="adm-form-label">
                  ULI <span className="adm-form-optional">(optional)</span>
                </label>
                <input
                  className="adm-form-input"
                  type="text"
                  placeholder="Unique Learner Index"
                  value={formState.uli}
                  onChange={e => handleFormChange('uli', e.target.value)}
                />
              </div>

              <div className="adm-form-row">
                <div className="adm-form-group">
                  <label className="adm-form-label">
                    Surname <span className="adm-form-required">*</span>
                  </label>
                  <input
                    className="adm-form-input"
                    type="text"
                    value={formState.surname}
                    onChange={e => handleFormChange('surname', e.target.value)}
                  />
                </div>
                <div className="adm-form-group">
                  <label className="adm-form-label">
                    First Name <span className="adm-form-required">*</span>
                  </label>
                  <input
                    className="adm-form-input"
                    type="text"
                    value={formState.first_name}
                    onChange={e => handleFormChange('first_name', e.target.value)}
                  />
                </div>
              </div>

              <div className="adm-form-row">
                <div className="adm-form-group">
                  <label className="adm-form-label">
                    Middle Name <span className="adm-form-optional">(optional)</span>
                  </label>
                  <input
                    className="adm-form-input"
                    type="text"
                    value={formState.middle_name}
                    onChange={e => handleFormChange('middle_name', e.target.value)}
                  />
                </div>

                {/* => Name extension is a dropdown (Jr., Sr., II, III, IV, N/A) */}
                <div className="adm-form-group">
                  <label className="adm-form-label">
                    Name Extension <span className="adm-form-optional">(optional)</span>
                  </label>
                  <select
                    className="adm-form-select"
                    value={formState.name_extension}
                    onChange={e => handleFormChange('name_extension', e.target.value)}
                  >
                    {NAME_EXTENSION_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="adm-form-row">
                {/* => Sex is a controlled dropdown - DB stores 'm' / 'f' */}
                <div className="adm-form-group">
                  <label className="adm-form-label">
                    Sex <span className="adm-form-required">*</span>
                  </label>
                  <select
                    className="adm-form-select"
                    value={formState.sex}
                    onChange={e => handleFormChange('sex', e.target.value)}
                  >
                    <option value="">Select…</option>
                    <option value="m">Male</option>
                    <option value="f">Female</option>
                  </select>
                </div>
                <div className="adm-form-group">
                  <label className="adm-form-label">
                    Civil Status <span className="adm-form-required">*</span>
                  </label>
                  <input
                    className="adm-form-input"
                    type="text"
                    placeholder="Single, Married, Widowed…"
                    value={formState.civil_status}
                    onChange={e => handleFormChange('civil_status', e.target.value)}
                  />
                </div>
              </div>

              <div className="adm-form-row">
                <div className="adm-form-group">
                  <label className="adm-form-label">
                    Birthdate <span className="adm-form-required">*</span>
                  </label>
                  <input
                    className="adm-form-input"
                    type="date"
                    value={formState.birthdate}
                    onChange={e => handleFormChange('birthdate', e.target.value)}
                  />
                </div>
                <div className="adm-form-group">
                  <label className="adm-form-label">
                    Nationality <span className="adm-form-required">*</span>
                  </label>
                  <input
                    className="adm-form-input"
                    type="text"
                    value={formState.nationality}
                    onChange={e => handleFormChange('nationality', e.target.value)}
                  />
                </div>
              </div>

              {/* ── Birthplace: cascading dropdowns Region → Province → City ── */}
              <p className="adm-form-section-label">Birthplace</p>

              {/* => Step 1: Region */}
              <div className="adm-form-group">
                <label className="adm-form-label">
                  Region <span className="adm-form-required">*</span>
                </label>
                <select
                  className="adm-form-select"
                  value={formState.birthplace_region}
                  onChange={e => handleFormChange('birthplace_region', e.target.value)}
                  disabled={loadingRegions}
                >
                  <option value="">
                    {loadingRegions ? 'Loading regions…' : 'Select region…'}
                  </option>
                  {regions.map(r => (
                    <option key={r.code} value={r.code}>{r.name}</option>
                  ))}
                </select>
              </div>

              {/* => Step 2: Province - hidden while provinces are loading or if region not yet picked */}
              {formState.birthplace_region && (
                <div className="adm-form-group">
                  <label className="adm-form-label">
                    Province{' '}
                    {provinces.length === 0 && !loadingProvinces
                      ? <span className="adm-form-optional">(not applicable – e.g. NCR)</span>
                      : <span className="adm-form-optional">(optional)</span>
                    }
                  </label>
                  <select
                    className="adm-form-select"
                    value={formState.birthplace_province}
                    onChange={e => handleFormChange('birthplace_province', e.target.value)}
                    disabled={loadingProvinces || provinces.length === 0}
                  >
                    <option value="">
                      {loadingProvinces
                        ? 'Loading provinces…'
                        : provinces.length === 0
                          ? 'No provinces (cities loaded directly)'
                          : 'Select province…'
                      }
                    </option>
                    {provinces.map(p => (
                      <option key={p.code} value={p.code}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* => Step 3: City / Municipality - enabled once province is chosen (or region for NCR) */}
              {formState.birthplace_region && (
                <div className="adm-form-group">
                  <label className="adm-form-label">
                    City / Municipality <span className="adm-form-required">*</span>
                  </label>
                  <select
                    className="adm-form-select"
                    value={formState.birthplace_city_or_municipality}
                    onChange={e => handleFormChange('birthplace_city_or_municipality', e.target.value)}
                    // => Disable until cities are available; for province regions, also require province first
                    disabled={
                      loadingCities ||
                      cities.length === 0 ||
                      (provinces.length > 0 && !formState.birthplace_province)
                    }
                  >
                    <option value="">
                      {loadingCities
                        ? 'Loading cities…'
                        : cities.length === 0
                          ? provinces.length > 0 && !formState.birthplace_province
                            ? 'Select a province first…'
                            : 'No cities available'
                          : 'Select city / municipality…'
                      }
                    </option>
                    {cities.map(c => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* ── Parents ── */}
              <p className="adm-form-section-label">Parents</p>

              <div className="adm-form-row">
                <div className="adm-form-group">
                  <label className="adm-form-label">
                    Mother's Name <span className="adm-form-required">*</span>
                  </label>
                  <input
                    className="adm-form-input"
                    type="text"
                    value={formState.mother_name}
                    onChange={e => handleFormChange('mother_name', e.target.value)}
                  />
                </div>
                <div className="adm-form-group">
                  <label className="adm-form-label">
                    Father's Name <span className="adm-form-required">*</span>
                  </label>
                  <input
                    className="adm-form-input"
                    type="text"
                    value={formState.father_name}
                    onChange={e => handleFormChange('father_name', e.target.value)}
                  />
                </div>
              </div>

              {/* ── Education & Employment ── */}
              <p className="adm-form-section-label">Education &amp; Employment</p>

              <div className="adm-form-group">
                <label className="adm-form-label">
                  Highest Educational Attainment <span className="adm-form-required">*</span>
                </label>
                <input
                  className="adm-form-input"
                  type="text"
                  value={formState.highest_educational_attainment}
                  onChange={e => handleFormChange('highest_educational_attainment', e.target.value)}
                />
              </div>

              <div className="adm-form-row">
                <div className="adm-form-group">
                  <label className="adm-form-label">
                    Employment Status <span className="adm-form-required">*</span>
                  </label>
                  <input
                    className="adm-form-input"
                    type="text"
                    placeholder="Employed, Unemployed, Self-Employed…"
                    value={formState.employment_status}
                    onChange={e => handleFormChange('employment_status', e.target.value)}
                  />
                </div>
                <div className="adm-form-group">
                  <label className="adm-form-label">
                    Client Type <span className="adm-form-optional">(optional)</span>
                  </label>
                  <input
                    className="adm-form-input"
                    type="text"
                    value={formState.client_type}
                    onChange={e => handleFormChange('client_type', e.target.value)}
                  />
                </div>
              </div>

              {formError   && <p className="adm-form-error">{formError}</p>}
              {formSuccess && <p className="adm-form-success">{formSuccess}</p>}

            </div>

            <div className="adm-modal-footer">
              <button
                className="adm-modal-cancel-btn"
                onClick={() => setShowEditModal(false)}
                disabled={formSaving}
              >
                Cancel
              </button>
              <button
                className="adm-modal-save-btn"
                onClick={handleSaveEdit}
                disabled={formSaving}
              >
                {formSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
