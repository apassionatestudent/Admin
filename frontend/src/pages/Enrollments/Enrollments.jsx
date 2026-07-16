// => admin/pages/Enrollments/Enrollments.jsx
// => Displays all Pending and Needs Clarification enrollments for admin review,
//    combined across both TESDA and SHS via the backend's UNION ALL list query.
// => Also handles cross-status search by email or name fields

import React, { useState, useEffect, useRef, useMemo } from 'react'; // => useMemo added for client-side filtering
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
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
};

// => Derives student full name from profile fields
// => Filters out falsy values AND 'N/A' so name extension doesn't appear when not applicable
const fullName = (row) => {
  const parts = [row.first_name, row.middle_name, row.last_name, row.name_extension]
    .filter(v => v && v.trim().toUpperCase() !== 'N/A');
  return parts.length ? parts.join(' ') : row.student_email ?? '-';
};

// => Enrollment type badge - distinguishes TESDA vs SHS rows in the combined list
const TYPE_LABEL = { TESDA: 'TESDA', SHS: 'SHS' };
const TYPE_CLASS = { TESDA: 'adm-type-badge--tesda', SHS: 'adm-type-badge--shs' };

// => Program column shows course name for TESDA rows, track - cluster for SHS
//    rows. shsLookups is passed in explicitly rather than closed over, since
//    these are called from EnrollmentTable, a sibling component - not
//    Enrollments() itself, where the actual state lives.
const trackLabel = (value, shsLookups) =>
  shsLookups.tracks.find(t => t.value === value)?.name ?? value;

const clusterLabel = (value, shsLookups) =>
  shsLookups.clusters.find(c => c.value === value)?.name ?? value;

const programDisplay = (row, shsLookups) =>
  row.enrollment_type === 'SHS'
    ? [
        row.track && trackLabel(row.track, shsLookups),
        row.cluster && clusterLabel(row.cluster, shsLookups),
      ].filter(Boolean).join(' - ') || '-'
    : row.course_name ?? '-';


// => Empty search filters - used for reset
const EMPTY_FILTERS = {
  email:          '',
  first_name:     '',
  middle_name:    '',
  last_name:      '',
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

  // => Client-side ONLY filters (type + branch) - never trigger a re-fetch,
  //    they just filter whatever's already loaded in `enrollments` /
  //    `searchResults`
  const [typeFilter,   setTypeFilter]   = useState('ALL');   // => 'ALL' | 'TESDA' | 'SHS'
  const [branchFilter, setBranchFilter] = useState('ALL');   // => 'ALL' | exact branch_name
  const [statusFilter, setStatusFilter] = useState('ALL');   // => 'ALL' | one of statusClass's keys

  // => Ref to abort stale search requests when a new one fires
  const abortRef = useRef(null);

  // => SHS track/cluster lookup data - used by EnrollmentTable via prop,
  //    since programDisplay lives outside this component
  const [shsLookups, setShsLookups] = useState({ tracks: [], clusters: [] });

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

  // => SHS track/cluster labels, fetched once - used to show human-readable
  //    names in the Program column instead of raw DB values like 'tech_prof'
  useEffect(() => {
    fetch('/api/admin/enrollments/shs/lookups', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        // => Only accept well-formed responses - an error body like
        //    {error: '...'} would otherwise corrupt state and crash
        //    programDisplay's .find() calls on the next render
        if (Array.isArray(data?.tracks) && Array.isArray(data?.clusters)) {
          setShsLookups(data);
        }
      })
      .catch(err => console.error('Failed to fetch SHS lookups:', err));
  }, []);

  // => Unique branch names pulled from whatever's currently loaded (default
  //    list or search results) - avoids a dedicated /branches endpoint
  //    since branch_name already rides along on every enrollment row.
  //    Recomputes only when the underlying data changes, not on every render.
  const availableBranches = useMemo(() => {
    const source = searchResults !== null ? searchResults : enrollments;
    const names = new Set(source.map(r => r.branch_name).filter(Boolean));
    return Array.from(names).sort();
  }, [enrollments, searchResults]);

  // => Applies type/branch/status filters in memory only - no fetch, no API call
  const applyFilters = (rows) => rows.filter(r =>
    (typeFilter === 'ALL'   || r.enrollment_type === typeFilter) &&
    (branchFilter === 'ALL' || r.branch_name === branchFilter) &&
    (statusFilter === 'ALL' || r.status === statusFilter)
  );

  // => Route must match App.jsx: /dashboard/enrollments/tesda/:publicId or /shs/:publicId
  // => Any enrollment_type other than 'SHS' falls back to the tesda/ route.
  const handleRowClick = (publicId, enrollmentType) => {
    const typeSegment = enrollmentType === 'SHS' ? 'shs' : 'tesda';
    navigate(`/dashboard/enrollments/${typeSegment}/${publicId}`);
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
    // => Abort any in-flight search first - otherwise a stale response can
    //    still resolve after clearing and silently repopulate results
    if (abortRef.current) abortRef.current.abort();
    setFilters(EMPTY_FILTERS);
    setSearchResults(null);
    setSearchError(null);
    setMoreOpen(false);
  };

  // => Determine what's currently displayed
  const isSearchMode = searchResults !== null;

  // => Split default enrollments into two priority buckets for visual grouping,
  //    then run them through the client-side type/branch filters
  const needsClarification = applyFilters(enrollments.filter(e => e.status === 'Needs Clarification'));
  const pending            = applyFilters(enrollments.filter(e => e.status === 'Pending'));

  // => Filtered version of search results - kept separate from raw
  //    searchResults so the "0 results from API" vs "0 after filtering"
  //    empty states below can be told apart
  const filteredSearchResults = isSearchMode ? applyFilters(searchResults) : [];

  return (
    <div className="adm-enroll-page">

      <div className="adm-enroll-header">
        <div>
          <h1 className="adm-enroll-title">Enrollments</h1>

          {/* => Subtitle changes based on whether a search is active */}
          <p className="adm-enroll-subtitle">
            {isSearchMode
              ? <>
                  Showing search results - <strong>{searchResults.length}</strong> enrollment{searchResults.length !== 1 ? 's' : ''} found.
                  {searchResults.length === 50 && ' Results are capped at 50 - refine your search for a more precise match.'}
                </>
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
                  value={filters.last_name}
                  onChange={e => setFilters(f => ({ ...f, last_name: e.target.value }))}
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
                  <option value="">- Any -</option>
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
          FILTER BUTTONS (type + branch)
          => Client-side only - toggling these never re-fetches, they just
             re-filter enrollments/searchResults already sitting in state
          ════════════════════════════════════ */}
      <div className="adm-filter-wrap">
        <div className="adm-filter-group">
          <span className="adm-filter-label">Type</span>
          {['ALL', 'TESDA', 'SHS'].map(t => (
            <button
              key={t}
              className={`adm-filter-btn ${typeFilter === t ? 'adm-filter-btn--active' : ''}`}
              onClick={() => setTypeFilter(t)}
            >
              {t === 'ALL' ? 'All' : t}
            </button>
          ))}
        </div>

        {/* => Only render the branch group if there's actually branch data loaded */}
        {availableBranches.length > 0 && (
          <div className="adm-filter-group">
            <span className="adm-filter-label">Branch</span>
            <button
              className={`adm-filter-btn ${branchFilter === 'ALL' ? 'adm-filter-btn--active' : ''}`}
              onClick={() => setBranchFilter('ALL')}
            >
              All
            </button>
            {availableBranches.map(name => (
              <button
                key={name}
                className={`adm-filter-btn ${branchFilter === name ? 'adm-filter-btn--active' : ''}`}
                onClick={() => setBranchFilter(name)}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {/* => Status filter as a dropdown rather than pills - 7 possible
               values (from statusClass) is too many for a comfortable
               button row */}
        <div className="adm-filter-group">
          {/* TODO: Only filtering based on pending and needs clarification, need to actual fetch when other statuses are selected */}
          <span className="adm-filter-label">Status</span>
          <select
            className="adm-filter-select"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All</option>
            {Object.keys(statusClass).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
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

          {/* => searchResults has rows, but the type/branch filters narrowed it to 0 */}
          {!searchLoading && searchResults.length > 0 && filteredSearchResults.length === 0 && (
            <div className="adm-enroll-state">
              <span className="adm-state-icon">🔍</span>
              <p>No results match the selected filters.</p>
            </div>
          )}

          {!searchLoading && filteredSearchResults.length > 0 && (
            <section className="adm-enroll-section">
              <EnrollmentTable rows={filteredSearchResults} onRowClick={handleRowClick} shsLookups={shsLookups} />
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
              <p>All caught up - no pending enrollments.</p>
            </div>
          )}

          {/* => enrollments has rows, but type/branch filters narrowed both buckets to 0 */}
          {!loading && !error && enrollments.length > 0 &&
            needsClarification.length === 0 && pending.length === 0 && (
            <div className="adm-enroll-state">
              <span className="adm-state-icon">🔍</span>
              <p>No enrollments match the selected filters.</p>
            </div>
          )}

          {/*  Needs Clarification group (shown first - higher urgency)  */}
          {!loading && !error && needsClarification.length > 0 && (
            <section className="adm-enroll-section">
              <h2 className="adm-section-label adm-section-label--clarification">
                Needs Clarification
                <span className="adm-section-count">{needsClarification.length}</span>
              </h2>
              <EnrollmentTable rows={needsClarification} onRowClick={handleRowClick} shsLookups={shsLookups} />
            </section>
          )}

          {/*  Pending group  */}
          {!loading && !error && pending.length > 0 && (
            <section className="adm-enroll-section">
              <h2 className="adm-section-label adm-section-label--pending">
                Pending
                <span className="adm-section-count">{pending.length}</span>
              </h2>
              <EnrollmentTable rows={pending} onRowClick={handleRowClick} shsLookups={shsLookups} />
            </section>
          )}
        </>
      )}

    </div>
  );
}

// 
// EnrollmentTable - reusable table sub-component
// => Now also shows status column in search mode since results span all statuses
// 
function EnrollmentTable({ rows, onRowClick, shsLookups }) {
  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Type</th>
            <th>Program</th>
            <th>Branch</th>
            <th>Submitted</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            // navigate via keyboard
            <tr
              key={row.public_id}
              className="adm-table-row"
              style={{ animationDelay: `${idx * 40}ms` }}
              onClick={() => onRowClick(row.public_id, row.enrollment_type)}
              tabIndex={0}
              role="button"
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onRowClick(row.public_id, row.enrollment_type);
                }
              }}
            >
              <td className="adm-td-student">
                <span className="adm-student-name">{fullName(row)}</span>
                <span className="adm-student-email">{row.student_email}</span>
              </td>
              <td>
                <span className={`adm-type-badge ${TYPE_CLASS[row.enrollment_type] || ''}`}>
                  {TYPE_LABEL[row.enrollment_type] ?? row.enrollment_type ?? '-'}
                </span>
              </td>
               <td>{programDisplay(row, shsLookups)}</td>
              <td>{row.branch_name ?? '-'}</td>
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