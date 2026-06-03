// => admin/pages/Enrollments/Enrollments.jsx
// => Displays all Pending and Needs Clarification enrollments for admin review
// => Also handles cross-status search by email or name fields

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import '../Enrollments/Enrollments.css';

// => Maps each status to a CSS modifier class - same convention as student side
const statusClass = {
  'Pending':             'status--pending',
  'Needs Clarification': 'status--clarification',
  'Approved':            'status--approved',
  'Rejected':            'status--rejected',
  'Dropped':             'status--dropped',
  'Completed':           'status--completed',
  'Reserved':            'status--reserved',
};

// => Formats ISO date string to a short readable date
const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
};

// => Derives student full name from profile fields
// => Filters out falsy values AND 'N/A' so name extension doesn't appear when not applicable
const fullName = (row) => {
  const parts = [row.first_name, row.middle_name, row.surname, row.name_extension]
    .filter(v => v && v.trim().toUpperCase() !== 'N/A');
  return parts.length ? parts.join(' ') : row.student_email ?? '—';
};

// => Empty search filters - used for reset
const EMPTY_FILTERS = {
  email:          '',
  first_name:     '',
  middle_name:    '',
  surname:        '',
  name_extension: '',
};

export default function Enrollments() {
  const navigate = useNavigate();

  // => Default enrollments (Pending + Needs Clarification)
  const [enrollments, setEnrollments] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);

  // => Search state
  const [filters,        setFilters]        = useState(EMPTY_FILTERS);
  const [moreOpen,       setMoreOpen]       = useState(false);   // => More Options panel toggle
  const [searchResults,  setSearchResults]  = useState(null);    // => null = not searched yet; [] = searched but empty
  const [searchLoading,  setSearchLoading]  = useState(false);
  const [searchError,    setSearchError]    = useState(null);

  // => Ref to abort stale search requests when a new one fires
  const abortRef = useRef(null);

  // => Fetch default (Pending + Needs Clarification) enrollments on mount
  useEffect(() => {
    const fetchEnrollments = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/enrollments', {
          credentials: 'include', // => sends the httpOnly admin JWT cookie
        });
        if (!res.ok) throw new Error('Failed to fetch enrollments.');
        const data = await res.json();
        setEnrollments(data.enrollments);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchEnrollments();
  }, []);

  const handleRowClick = (publicId) => {
    // => Route must match App.jsx: /dashboard/enrollments/:publicId
    navigate(`/dashboard/enrollments/${publicId}`);
  };

  // => Build query string from non-empty filters only
  const buildQuery = (f) => {
    const params = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => {
      if (v && v.trim()) params.set(k, v.trim());
    });
    return params.toString();
  };

  // => Run search against /api/admin/enrollments/search
  const handleSearch = async () => {
    const query = buildQuery(filters);
    if (!query) return; // => nothing to search

    // => Cancel any in-flight search
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setSearchLoading(true);
    setSearchError(null);
    setSearchResults(null);

    try {
      const res = await fetch(`/api/admin/enrollments/search?${query}`, {
        credentials: 'include',
        signal: abortRef.current.signal,
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Search failed.');
      }
      const data = await res.json();
      setSearchResults(data.enrollments);
    } catch (err) {
      if (err.name === 'AbortError') return; // => stale request, ignore
      setSearchError(err.message);
    } finally {
      setSearchLoading(false);
    }
  };

  // => Allow pressing Enter in the email field to trigger search
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  // => Clear search and restore default view
  const handleClearSearch = () => {
    setFilters(EMPTY_FILTERS);
    setSearchResults(null);
    setSearchError(null);
    setMoreOpen(false);
  };

  // => Determine what's currently displayed
  const isSearchMode = searchResults !== null;

  // => Split default enrollments into two priority buckets for visual grouping
  const needsClarification = enrollments.filter(e => e.status === 'Needs Clarification');
  const pending            = enrollments.filter(e => e.status === 'Pending');

  return (
    <div className="adm-enroll-page">

      <div className="adm-enroll-header">
        <div>
          <h1 className="adm-enroll-title">Enrollments</h1>

          {/* => Subtitle changes based on whether a search is active */}
          <p className="adm-enroll-subtitle">
            {isSearchMode
              ? <>Showing search results — <strong>{searchResults.length}</strong> enrollment{searchResults.length !== 1 ? 's' : ''} found.</>
              : <>Showing <strong>Pending</strong> and <strong>Needs Clarification</strong> submissions.</>
            }
          </p>
        </div>

        {/* => Live count badge - only shown in default mode */}
        {!loading && !error && !isSearchMode && (
          <div className="adm-enroll-count">
            <span className="adm-enroll-count-num">{enrollments.length}</span>
            <span className="adm-enroll-count-label">awaiting review</span>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════
          SEARCH BAR
          ════════════════════════════════════ */}
      <div className="adm-search-wrap">

        {/* => Primary search row: email input + Search button + More Options toggle */}
        <div className="adm-search-row">
          <input
            type="text"
            className="adm-search-input"
            placeholder="Search by email…"
            value={filters.email}
            onChange={e => setFilters(f => ({ ...f, email: e.target.value }))}
            onKeyDown={handleKeyDown}
          />

          <button
            className="adm-search-btn"
            onClick={handleSearch}
            disabled={searchLoading || !buildQuery(filters)}
          >
            {searchLoading ? 'Searching…' : 'Search'}
          </button>

          {/* => Toggle More Options panel */}
          <button
            className={`adm-more-btn ${moreOpen ? 'adm-more-btn--open' : ''}`}
            onClick={() => setMoreOpen(o => !o)}
          >
            More Options {moreOpen ? '▲' : '▼'}
          </button>

          {/* => Clear search - only visible when in search mode */}
          {isSearchMode && (
            <button className="adm-clear-btn" onClick={handleClearSearch}>
              ✕ Clear Search
            </button>
          )}
        </div>

        {/* => Collapsible More Options panel */}
        {moreOpen && (
          <div className="adm-more-panel">
            <div className="adm-more-grid">
              <div className="adm-more-field">
                <label className="adm-more-label">First Name</label>
                <input
                  type="text"
                  className="adm-more-input"
                  placeholder="e.g. Juan"
                  value={filters.first_name}
                  onChange={e => setFilters(f => ({ ...f, first_name: e.target.value }))}
                  onKeyDown={handleKeyDown}
                />
              </div>

              <div className="adm-more-field">
                <label className="adm-more-label">Middle Name</label>
                <input
                  type="text"
                  className="adm-more-input"
                  placeholder="e.g. Dela"
                  value={filters.middle_name}
                  onChange={e => setFilters(f => ({ ...f, middle_name: e.target.value }))}
                  onKeyDown={handleKeyDown}
                />
              </div>

              <div className="adm-more-field">
                <label className="adm-more-label">Last Name</label>
                <input
                  type="text"
                  className="adm-more-input"
                  placeholder="e.g. Cruz"
                  value={filters.surname}
                  onChange={e => setFilters(f => ({ ...f, surname: e.target.value }))}
                  onKeyDown={handleKeyDown}
                />
              </div>

              <div className="adm-more-field">
                <label className="adm-more-label">Name Extension</label>
                {/* => Dropdown since name extensions are a fixed set */}
                <select
                  className="adm-more-input"
                  value={filters.name_extension}
                  onChange={e => setFilters(f => ({ ...f, name_extension: e.target.value }))}
                >
                  <option value="">— Any —</option>
                  <option value="Jr.">Jr.</option>
                  <option value="Sr.">Sr.</option>
                  <option value="II">II</option>
                  <option value="III">III</option>
                  <option value="IV">IV</option>
                  <option value="V">V</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* => Search error */}
        {searchError && (
          <p className="adm-search-error">⚠ {searchError}</p>
        )}
      </div>

      {/* ════════════════════════════════════
          SEARCH RESULTS MODE
          ════════════════════════════════════ */}
      {isSearchMode && (
        <>
          {searchLoading && (
            <div className="adm-enroll-state">
              <div className="adm-spinner" />
              <p>Searching…</p>
            </div>
          )}

          {!searchLoading && searchResults.length === 0 && (
            <div className="adm-enroll-state">
              <span className="adm-state-icon">🔍</span>
              <p>No enrollments matched your search.</p>
            </div>
          )}

          {!searchLoading && searchResults.length > 0 && (
            <section className="adm-enroll-section">
              <EnrollmentTable rows={searchResults} onRowClick={handleRowClick} />
            </section>
          )}
        </>
      )}

      {/* ════════════════════════════════════
          DEFAULT MODE (Pending + Needs Clarification)
          ════════════════════════════════════ */}
      {!isSearchMode && (
        <>
          {/*  Loading state  */}
          {loading && (
            <div className="adm-enroll-state">
              <div className="adm-spinner" />
              <p>Loading enrollments…</p>
            </div>
          )}

          {/*  Error state  */}
          {!loading && error && (
            <div className="adm-enroll-state adm-enroll-state--error">
              <span className="adm-state-icon">⚠</span>
              <p>{error}</p>
            </div>
          )}

          {/*  Empty state  */}
          {!loading && !error && enrollments.length === 0 && (
            <div className="adm-enroll-state">
              <span className="adm-state-icon">✓</span>
              <p>All caught up — no pending enrollments.</p>
            </div>
          )}

          {/*  Needs Clarification group (shown first — higher urgency)  */}
          {!loading && !error && needsClarification.length > 0 && (
            <section className="adm-enroll-section">
              <h2 className="adm-section-label adm-section-label--clarification">
                Needs Clarification
                <span className="adm-section-count">{needsClarification.length}</span>
              </h2>
              <EnrollmentTable rows={needsClarification} onRowClick={handleRowClick} />
            </section>
          )}

          {/*  Pending group  */}
          {!loading && !error && pending.length > 0 && (
            <section className="adm-enroll-section">
              <h2 className="adm-section-label adm-section-label--pending">
                Pending
                <span className="adm-section-count">{pending.length}</span>
              </h2>
              <EnrollmentTable rows={pending} onRowClick={handleRowClick} />
            </section>
          )}
        </>
      )}

    </div>
  );
}

// 
// EnrollmentTable — reusable table sub-component
// => Now also shows status column in search mode since results span all statuses
// 
function EnrollmentTable({ rows, onRowClick }) {
  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Course</th>
            <th>Sector</th>
            <th>Branch</th>
            <th>Assessment</th>
            <th>Submitted</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={row.public_id}
              className="adm-table-row"
              style={{ animationDelay: `${idx * 40}ms` }}
              onClick={() => onRowClick(row.public_id)}
            >
              <td className="adm-td-student">
                <span className="adm-student-name">{fullName(row)}</span>
                <span className="adm-student-email">{row.student_email}</span>
              </td>
              <td>{row.course_name ?? '—'}</td>
              <td>{row.sector ?? '—'}</td>
              <td>{row.branch_name ?? '—'}</td>
              <td>{row.assessment_type ?? '—'}</td>
              <td className="adm-td-date">{formatDate(row.submitted_at)}</td>
              <td>
                <span className={`adm-badge ${statusClass[row.status] || ''}`}>
                  {row.status}
                </span>
              </td>
              <td className="adm-td-arrow">›</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}