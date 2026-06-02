// => admin/pages/Enrollments/EnrollmentDetail.jsx
// => Full enrollment detail for admins: student info, enrollment fields,
//    submitted documents (previewed inline), work exp, trainings, and status changer

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import BackButton from '../BackButton/BackButton.jsx';

import './EnrollmentDetail.css';

import searchIcon from '../../assets/icons/magnifying-glass.png'; // => magnifying glass icon for doc preview hint
import ConfirmModal from '../../components/ConfirmModal/ConfirmModal.jsx';
import clipboardIcon from '../../assets/icons/clipboard.png';
import checkMarkIcon from '../../assets/icons/checkmark.png';
import errorIcon from '../../assets/icons/warning.png';

// Constants


// => All possible status transitions an admin can apply
const STATUS_OPTIONS = [
  'Pending',
  'Approved',
  'Needs Clarification',
  'Rejected',
  'Dropped',
  'Completed',
  'Reserved',
];

// => CSS modifier class per status - used on badges throughout the page
const statusClass = {
  'Pending':             'status--pending',
  'Approved':            'status--approved',
  'Needs Clarification': 'status--clarification',
  'Rejected':            'status--rejected',
  'Dropped':             'status--dropped',
  'Completed':           'status--completed',
  'Reserved':            'status--reserved',
};

// Utility helpers
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
};

const formatCurrency = (amount) => {
  if (amount == null) return '-';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
};

// => Now accepts any object - called with profile for name, enrollment for course header
// => Filters out falsy values AND 'N/A' so name extension doesn't appear when not applicable
const fullName = (p) =>
  [p.first_name, p.middle_name, p.surname, p.name_extension]
    .filter(v => v && v.trim().toUpperCase() !== 'N/A')
    .join(' ') || '-';
    
// DocPreview sub-component
// => Streams a single R2 document via the admin proxy
// => Click image/PDF thumbnail to open fullscreen modal
function DocPreview({ documentKey, documentType, onOpenModal }) {
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
        // => Clicking opens the modal - same blob URL passed up to parent
        <div
          className="adm-doc-clickable"
          onClick={() => onOpenModal({ url, documentType, isPdf })}
          title="Click to enlarge"
        >
          {isPdf ? (
            // => PDF shows a small non-interactive thumbnail; click opens modal
            <iframe
              src={url}
              className="adm-doc-iframe adm-doc-iframe--thumb"
              title={documentType}
              // => pointer-events none so clicks pass through to the wrapper div
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
    </div>
  );
}

// 
// Main component
// 
export default function EnrollmentDetail() {
  const { publicId } = useParams();
  const navigate     = useNavigate();

  // => Main data bundle from the server
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  // => Status update UI state
  const [selectedStatus, setSelectedStatus] = useState('');
  const [saving,         setSaving]         = useState(false);
  const [saveMsg,        setSaveMsg]        = useState(null); // => { type: 'success'|'error', text }

  // => Modal state: null when closed, { url, documentType, isPdf } when open
  const [modal, setModal] = useState(null);
  // => Confirm modal state for status change - message is built dynamically from selected status
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleOpenModal  = (doc) => setModal(doc);
  const handleCloseModal = ()    => setModal(null);

  // => Address display names - resolved from codes via /api/location/*
  // => Codes are stored in the DB; we resolve them to readable names for the admin view
  const [locationNames, setLocationNames] = useState({
    region:   null,
    province: null,
    city:     null,
    barangay: null,
  });

  // => Birthplace display names - same resolution approach as address
  const [birthplaceNames, setBirthplaceNames] = useState({
    region:   null,
    province: null,
    city:     null,
  });

  //  Fetch full enrollment detail on mount 
  useEffect(() => {
    if (!publicId) return;

    const fetchDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/enrollments/${publicId}`, {
          credentials: 'include',
        });
        if (res.status === 404) throw new Error('Enrollment not found.');
        if (!res.ok) throw new Error('Failed to fetch enrollment detail.');
        const json = await res.json();
        setData(json);
        // => Pre-select the current status in the dropdown
        setSelectedStatus(json.enrollment.status);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [publicId]);

  // => Resolve address codes to human-readable names after main data loads
  // => Mirrors the same /api/location/* endpoints used in the student enrollment form
  useEffect(() => {
    if (!data?.address) return;

    const addr = data.address;

    const resolve = async () => {
      const names = { region: null, province: null, city: null, barangay: null };

      try {
        // => Step 1: Region name
        // => psgc.cloud returns short codes (e.g. "09") but DB stores 10-digit codes (e.g. "0900000000")
        // => So we match by checking if the stored code starts with the short code, or vice versa
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

        // => Step 2: Province name - NCR has no province, skip if empty
        if (addr.province_code) {
          const res = await fetch(`/api/location/provinces/${addr.region_code}`);
          if (res.ok) {
            const provinces = await res.json();
            const match = provinces.find(p => p.code === addr.province_code);
            names.province = match?.name ?? addr.province_code;
          }
        }

        // => Step 3: City/Municipality name
        // => NCR cities are fetched by region; others by province
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

        // => Step 4: Barangay name
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
        // => Non-critical - address codes will show as fallback if resolution fails
        console.error('Failed to resolve address location names:', err);
      }
    };

    resolve();
  }, [data]); // => re-runs if data changes (e.g. after a status update that re-fetches)

  // => Resolve birthplace codes to readable names
  // => profile stores birthplace_region, birthplace_province, birthplace_city_or_municipality as PSGC codes
  useEffect(() => {
    if (!data?.profile) return;

    const p = data.profile;

    // => Skip if none of the birthplace fields look like codes (all 10 digits)
    if (!p.birthplace_region && !p.birthplace_province && !p.birthplace_city_or_municipality) return;

    const resolve = async () => {
      const names = { region: null, province: null, city: null };

      try {
        // => Step 1: Birthplace region
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

        // => Step 2: Birthplace province
        if (p.birthplace_province && p.birthplace_region) {
          const res = await fetch(`/api/location/provinces/${p.birthplace_region}`);
          if (res.ok) {
            const provinces = await res.json();
            const match = provinces.find(pr => pr.code === p.birthplace_province);
            names.province = match?.name ?? p.birthplace_province;
          }
        }

        // => Step 3: Birthplace city/municipality
        if (p.birthplace_city_or_municipality) {
          const endpoint = p.birthplace_province
            ? `/api/location/cities/${p.birthplace_province}`
            : `/api/location/cities-by-region/${p.birthplace_region}`;
          const res = await fetch(endpoint);
          if (res.ok) {
            const cities = await res.json();
            const match = cities.find(c => c.code === p.birthplace_city_or_municipality);
            names.city = match?.name ?? p.birthplace_city_or_municipality;
          }
        }

        setBirthplaceNames(names);
      } catch (err) {
        console.error('Failed to resolve birthplace names:', err);
      }
    };

    resolve();
  }, [data]);

  //  Status update handler - opens confirm modal first 
  const handleStatusSave = () => {
    if (!selectedStatus || selectedStatus === data?.enrollment?.status) return;
    // => Open confirm modal instead of saving immediately
    setConfirmOpen(true);
  };

  // => Called when admin confirms the status change in the modal
  const handleStatusConfirmed = async () => {
    setConfirmOpen(false);
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/admin/enrollments/${publicId}/status`, {
        method:      'PATCH',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ status: selectedStatus }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Failed to update status.');
      }
      // => Reflect the new status in local state without a full re-fetch
      setData(prev => ({
        ...prev,
        enrollment: { ...prev.enrollment, status: selectedStatus },
      }));
      setSaveMsg({ type: 'success', text: `Status updated to "${selectedStatus}".` });
    } catch (err) {
      setSaveMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  //  Convenience destructure 
  const enrollment   = data?.enrollment   ?? {};
  const profile      = data?.profile      ?? {};
  const docs         = data?.docs         ?? [];
  const workExp      = data?.workExp      ?? [];
  const trainings    = data?.trainings    ?? [];
  const licensures   = data?.licensures   ?? [];
  const competencies = data?.competencies ?? [];
  const contacts     = data?.contacts     ?? [];
  const address      = data?.address      ?? null;

  return (
    <div className="adm-detail-page">

      {/*  Back button  */}
      <BackButton destination="Enrollments" onClick={() => navigate('/dashboard/enrollments')} />

      {/*  Loading  */}
      {loading && (
        <div className="adm-detail-state">
          <div className="adm-spinner" />
          <p>Loading enrollment detail…</p>
        </div>
      )}

      {/*  Error  */}
      {!loading && error && (
        <div className="adm-detail-state adm-detail-state--error">
          <span>⚠</span>
          <p>{error}</p>
        </div>
      )}

      {/*  Content  */}
      {!loading && !error && data && (
        <div className="adm-detail-body">

          {/* ════════════════════════════════════
              HEADER: course + student name + status badge
              ════════════════════════════════════ */}
          <div className="adm-detail-hero">
            <div className="adm-hero-left">
              <p className="adm-hero-course">{enrollment.course_name ?? '-'}</p>
              {/* => name comes from profile, not enrollment */}
              <h2 className="adm-hero-name">{fullName(profile)}</h2>
              <p className="adm-hero-email">{enrollment.student_username}</p>
            </div>
            <span className={`adm-hero-badge ${statusClass[enrollment.status] || ''}`}>
              {enrollment.status}
            </span>
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
                  setSaveMsg(null);
                }}
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              <button
                className="adm-status-btn"
                onClick={handleStatusSave}
                disabled={saving || selectedStatus === enrollment.status}
              >
                {saving ? 'Saving…' : 'Save Status'}
              </button>

              {saveMsg && (
                <span className={`adm-save-msg adm-save-msg--${saveMsg.type}`}>
                  {saveMsg.text}
                </span>
              )}
            </div>
          </section>

          {/* ════════════════════════════════════
              ENROLLMENT INFORMATION
              ════════════════════════════════════ */}
          <section className="adm-section">
            <h3 className="adm-section-title">Enrollment Information</h3>
            <div className="adm-info-grid">
              <InfoCard label="Course"         value={enrollment.course_name ?? '-'} />
              <InfoCard label="Sector"         value={enrollment.sector ?? '-'} />
              <InfoCard label="Assessment Type" value={enrollment.assessment_type ?? '-'} />
              <InfoCard label="Branch"         value={enrollment.branch_name ?? '-'} />
              <InfoCard
                label="Class Period"
                value={
                  enrollment.start_date
                    ? `${formatDate(enrollment.start_date)} – ${formatDate(enrollment.end_date)}`
                    : '-'
                }
              />
              <InfoCard label="Fee at Enrollment" value={formatCurrency(enrollment.fee_at_enrollment)} />
              <InfoCard label="Date Submitted"    value={formatDate(enrollment.submitted_at)} />
              <InfoCard label="SHS Graduate"      value={enrollment.is_shs ? 'Yes' : 'No'} />
              <InfoCard label="TESDA Scholar"     value={enrollment.is_tesda_scholar ? 'Yes' : 'No'} />
            </div>
          </section>

          {/* ════════════════════════════════════
              STUDENT PROFILE
              ════════════════════════════════════ */}
          <section className="adm-section">
            <h3 className="adm-section-title">Student Profile</h3>
            <div className="adm-info-grid">
              <InfoCard label="Full Name"     value={fullName(profile)} />
              <InfoCard label="Email"         value={enrollment.student_username ?? '-'} />
              {/* => all profile fields now read from profile.* not enrollment.* */}
              <InfoCard label="Sex"           value={profile.sex ?? '-'} />
              <InfoCard label="Birthdate"     value={formatDate(profile.birthdate)} />
              <InfoCard label="Nationality"   value={profile.nationality ?? '-'} />
              <InfoCard label="Civil Status"  value={profile.civil_status ?? '-'} />
              <InfoCard label="Employment"    value={profile.employment_status ?? '-'} />
              <InfoCard label="Education"     value={profile.highest_educational_attainment ?? '-'} />
              <InfoCard label="Mother's Name" value={profile.mother_name ?? '-'} />
              <InfoCard label="Father's Name" value={profile.father_name ?? '-'} />
              <InfoCard label="Client Type"   value={profile.client_type ?? '-'} />
              <InfoCard
                label="Birthplace"
                value={
                  [
                    birthplaceNames.city     ?? profile.birthplace_city_or_municipality,
                    birthplaceNames.province ?? profile.birthplace_province,
                    birthplaceNames.region   ?? profile.birthplace_region,
                  ].filter(Boolean).join(', ') || '-'
                }
              />     
              {contacts.map((c, i) => (
                <InfoCard key={i} label={c.contact_type} value={c.contact_value} />
              ))}
            </div>

            {/* => Address */}
            {address && (
              <div className="adm-info-grid" style={{ marginTop: '12px' }}>
                <InfoCard label="Street"   value={address.street ?? '-'} />
                {/* => Show resolved name; fall back to code while loading or if resolution fails */}
                <InfoCard label="Region"   value={locationNames.region   ?? address.region_code   ?? '-'} />
                <InfoCard label="Province" value={locationNames.province ?? address.province_code ?? '-'} />
                <InfoCard label="City"     value={locationNames.city     ?? address.city_code     ?? '-'} />
                <InfoCard label="Barangay" value={locationNames.barangay ?? address.barangay_code ?? '-'} />
                <InfoCard label="Zip"      value={address.zip_code ?? '-'} />
              </div>
            )}
          </section>

          {/* ════════════════════════════════════
              SUBMITTED DOCUMENTS
              => Each doc is fetched and previewed inline via the R2 proxy
              ════════════════════════════════════ */}
          <section className="adm-section">
            <h3 className="adm-section-title">
              Submitted Documents
              <span className="adm-section-count-inline">{docs.length}</span>
            </h3>

            {docs.length === 0 ? (
              <p className="adm-empty-note">No documents uploaded.</p>
            ) : (
              <div className="adm-docs-grid">
                {docs.map(doc => (
                  <DocPreview
                    key={doc.public_id}
                    documentKey={doc.document_key}
                    documentType={doc.document_type}
                    onOpenModal={handleOpenModal}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ════════════════════════════════════
              WORK EXPERIENCE
              ════════════════════════════════════ */}
          {workExp.length > 0 && (
            <section className="adm-section">
              <h3 className="adm-section-title">Work Experience</h3>
              <div className="adm-sub-table-wrap">
                <table className="adm-sub-table">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Position</th>
                      <th>Salary</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Appointment</th>
                      <th>Years</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workExp.map((w, i) => (
                      <tr key={i}>
                        <td>{w.company}</td>
                        <td>{w.position ?? '-'}</td>
                        <td>{w.salary ?? '-'}</td>
                        <td>{formatDate(w.date_from)}</td>
                        <td>{formatDate(w.date_to)}</td>
                        <td>{w.appointment_status ?? '-'}</td>
                        <td>{w.years_exp ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ════════════════════════════════════
              TRAINING & SEMINARS
              ════════════════════════════════════ */}
          {trainings.length > 0 && (
            <section className="adm-section">
              <h3 className="adm-section-title">Trainings & Seminars</h3>
              <div className="adm-sub-table-wrap">
                <table className="adm-sub-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Venue</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Hours</th>
                      <th>Conducted By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainings.map((t, i) => (
                      <tr key={i}>
                        <td>{t.title}</td>
                        <td>{t.venue ?? '-'}</td>
                        <td>{formatDate(t.date_from)}</td>
                        <td>{formatDate(t.date_to)}</td>
                        <td>{t.hours ?? '-'}</td>
                        <td>{t.conducted_by ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ════════════════════════════════════
              LICENSURE EXAMINATIONS
              ════════════════════════════════════ */}
          {licensures.length > 0 && (
            <section className="adm-section">
              <h3 className="adm-section-title">Licensure Examinations</h3>
              <div className="adm-sub-table-wrap">
                <table className="adm-sub-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Year Taken</th>
                      <th>Venue</th>
                      <th>Rating</th>
                      <th>Expiry</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {licensures.map((l, i) => (
                      <tr key={i}>
                        <td>{l.title}</td>
                        <td>{l.year_taken ?? '-'}</td>
                        <td>{l.examination_venue ?? '-'}</td>
                        <td>{l.rating ?? '-'}</td>
                        <td>{formatDate(l.expiry_date)}</td>
                        <td>{l.remarks ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ════════════════════════════════════
              COMPETENCY ASSESSMENTS
              ════════════════════════════════════ */}
          {competencies.length > 0 && (
            <section className="adm-section">
              <h3 className="adm-section-title">Competency Assessments</h3>
              <div className="adm-sub-table-wrap">
                <table className="adm-sub-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Level</th>
                      <th>Industry Sector</th>
                      <th>Certificate #</th>
                      <th>Date Issued</th>
                      <th>Expiration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {competencies.map((c, i) => (
                      <tr key={i}>
                        <td>{c.title}</td>
                        <td>{c.qualification_level ?? '-'}</td>
                        <td>{c.industry_sector ?? '-'}</td>
                        <td>{c.certificate_number ?? '-'}</td>
                        <td>{formatDate(c.date_of_issuance)}</td>
                        <td>{formatDate(c.expiration_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ════════════════════════════════════
              CONFIRM STATUS CHANGE MODAL
              => Asks admin to confirm before patching status
              ════════════════════════════════════ */}
          <ConfirmModal
            isOpen={confirmOpen}
            message={`Change enrollment status to "${selectedStatus}"?`}
            onConfirm={handleStatusConfirmed}
            onCancel={() => setConfirmOpen(false)}
          />

          {/* ════════════════════════════════════
              DOCUMENT MODAL
              => Opens when any doc thumbnail is clicked
              => Clicking the backdrop or × closes it
              ════════════════════════════════════ */}
          {modal && (
            <div className="adm-modal-backdrop" onClick={handleCloseModal}>
              <div
                className="adm-modal-box"
                onClick={e => e.stopPropagation()} // => prevent backdrop click from firing inside
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

// InfoCard - reusable label+value cell
// => copyable prop enables clipboard icon; copies the displayed value text
function InfoCard({ label, value, copyable = true }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    // => Only copy if there's a real value (not a dash placeholder)
    if (!value || value === '-' || value === '—') return;
    navigator.clipboard.writeText(String(value)).then(() => {
      setCopied(true);
      // => Reset the copied indicator after 1.5s
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="adm-info-card">
      <p className="adm-info-label">{label}</p>
      <div className="adm-info-value-row">
        <p className="adm-info-value">{value}</p>
        {copyable && value && value !== '-' && value !== '—' && (
          <button
            className={`adm-copy-btn ${copied ? 'adm-copy-btn--copied' : ''}`}
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied ? (
              <img src={checkMarkIcon} className="adm-copy-icon" /> 
            ) : (
              // => Clipboard icon 
              <img src={clipboardIcon} className="adm-copy-icon" /> 
            )}
          </button>
        )}
      </div>
    </div>
  );
}
