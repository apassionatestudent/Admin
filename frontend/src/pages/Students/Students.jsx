// => admin/pages/Students/Students.jsx
// => Paginated student list with search; mirrors Classes.jsx pattern

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import './Students.css';

// 
// HELPERS
// 

// => Derives display name from row fields; falls back to email
const fullName = (row) => {
  const parts = [row.first_name, row.middle_name, row.surname, row.name_extension]
    .filter(v => v && v.trim().toUpperCase() !== 'N/A');
  return parts.length ? parts.join(' ') : row.username ?? '-';
};

// => Formats ISO timestamp to short local date
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
};

// => Name extension options for the More Options dropdown
// => Mirrors the same list used in StudentDetail.jsx edit modal
const NAME_EXTENSION_OPTIONS = ['N/A', 'Jr.', 'Sr.', 'II', 'III', 'IV'];

// 
// COMPONENT
// 
export default function Students() {
  const navigate       = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // => Read page from URL so browser back/forward works
  const currentPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

  // => List state
  const [students,   setStudents]   = useState([]);
  const [total,      setTotal]      = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  // => activeCount is ALWAYS the count of active students regardless of search mode
  // => It is fetched once on mount and refreshed only when the default list reloads
  // => This keeps the top-right badge stable during searches
  const [activeCount, setActiveCount] = useState(0);

  // => Search state
  const [searchMode,      setSearchMode]      = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [searchError,     setSearchError]     = useState('');

  // => Main search field (free text)
  const [q, setQ] = useState('');

  // => More Options fields
  const [filterSurname,       setFilterSurname]       = useState('');
  const [filterFirstName,     setFilterFirstName]     = useState('');
  const [filterMiddleName,    setFilterMiddleName]    = useState('');
  // => Name extension is a dropdown - default empty string means "any"
  const [filterNameExtension, setFilterNameExtension] = useState('');

  // => Active search filters (committed when Search is clicked)
  const [activeFilters, setActiveFilters] = useState(null);

  // 
  // FETCH LIST (default paginated view - active students only)
  // 
  const fetchList = useCallback(async (page) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/students?page=${page}&active=true`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Failed to fetch students.');
      }
      const data = await res.json();
      setStudents(data.rows);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      // => Keep the active count badge in sync with the real active total
      setActiveCount(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // 
  // FETCH SEARCH RESULTS (paginated - searches all statuses)
  // 
  const fetchSearch = useCallback(async (filters, page) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page });
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });

      const res = await fetch(`/api/admin/students/search?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Search failed.');
      }
      const data = await res.json();
      setStudents(data.rows);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      // => Do NOT update activeCount here - search results include inactive students
      // => so the badge must stay at the last known active count
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // 
  // EFFECT: re-fetch whenever page changes or search mode toggles
  // 
  useEffect(() => {
    if (searchMode && activeFilters) {
      fetchSearch(activeFilters, currentPage);
    } else {
      fetchList(currentPage);
    }
  }, [currentPage, searchMode, activeFilters, fetchList, fetchSearch]);

  // 
  // HANDLERS
  // 

  // => Build filters from current field state and fire search
  // => q (main bar) and More Options fields are always combined - no branching
  // => This lets the admin type an email in the main bar while More Options is open
  const handleSearch = () => {
    setSearchError('');

    // => Always collect all fields regardless of whether More Options is open
    const builtFilters = {
      q:              q.trim(),
      surname:        filterSurname,
      first_name:     filterFirstName,
      middle_name:    filterMiddleName,
      // => Only included if admin picked a real option (not blank "Any")
      name_extension: filterNameExtension,
    };

    // => Require at least one non-empty field across both the main bar and More Options
    const hasFilter = Object.values(builtFilters).some(v => v && v.trim());
    if (!hasFilter) {
      setSearchError('Please enter at least one search term.');
      return;
    }

    setActiveFilters(builtFilters);
    setSearchMode(true);
    // => Reset to page 1 on new search
    setSearchParams({ page: '1' });
  };

  const handleClear = () => {
    setQ('');
    setFilterSurname('');
    setFilterFirstName('');
    setFilterMiddleName('');
    setFilterNameExtension('');
    setActiveFilters(null);
    setSearchMode(false);
    setSearchError('');
    setSearchParams({ page: '1' });
  };

  // => Navigate to a page number
  const goToPage = (page) => {
    if (page < 1 || page > totalPages) return;
    setSearchParams(searchMode && activeFilters
      ? { ...Object.fromEntries(
            Object.entries(activeFilters).filter(([, v]) => v)
          ), page: String(page) }
      : { page: String(page) }
    );
  };

  // 
  // RENDER STATES
  // 
  const renderState = () => {
    if (loading) {
      return (
        <div className="adm-students-state">
          <div className="adm-spinner" />
          <p>Loading students…</p>
        </div>
      );
    }
    if (error) {
      return (
        <div className="adm-students-state adm-students-state--error">
          <span className="adm-state-icon">⚠</span>
          <p>{error}</p>
        </div>
      );
    }
    if (students.length === 0) {
      return (
        <div className="adm-students-state">
          <span className="adm-state-icon">👤</span>
          <p>{searchMode ? 'No students matched your search.' : 'No students registered yet.'}</p>
        </div>
      );
    }
    return null;
  };

  // 
  // PAGINATION HELPERS
  // 

  // => Builds a compact page number array like [1, '…', 4, 5, 6, '…', 10]
  const buildPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages = [];
    pages.push(1);
    if (currentPage > 3) pages.push('…');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push('…');
    pages.push(totalPages);
    return pages;
  };

  // 
  // RENDER
  // 
  return (
    <div className="adm-students-page">

      {/* ════ PAGE HEADER ════ */}
      <div className="adm-students-header">
        <div>
          <h1 className="adm-students-title">Students</h1>
          <p className="adm-students-subtitle">
            {searchMode
              ? <><strong>{total}</strong> result{total !== 1 ? 's' : ''} found</>
              : <>Showing <strong>{students.length}</strong> of <strong>{total}</strong> active students</>
            }
          </p>
        </div>

        {/* => activeCount is always the true active student count, never the search result count */}
        <div className="adm-students-count">
          <span className="adm-students-count-num">{activeCount}</span>
          <span className="adm-students-count-label">Active Students</span>
        </div>
      </div>

      {/* ════ SEARCH BAR ════ */}
      <div className="adm-search-wrap">
        <div className="adm-search-row">
          {/* => Main search: free text - ORs across name + email on the backend */}
          <input
            className="adm-search-input"
            type="text"
            placeholder="Search by name or email…"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
          />

          <button
            className="adm-search-btn"
            onClick={handleSearch}
            disabled={loading}
          >
            {loading ? 'Searching…' : 'Search'}
          </button>

          <button
            className={`adm-more-btn ${showMoreFilters ? 'adm-more-btn--open' : ''}`}
            onClick={() => setShowMoreFilters(p => !p)}
          >
            {showMoreFilters ? 'More Options ▲' : 'More Options ▼'}
          </button>

          {searchMode && (
            <button className="adm-clear-btn" onClick={handleClear}>
              ✕ Clear Search
            </button>
          )}
        </div>

        {/* => Expanded more-options panel */}
        {showMoreFilters && (
          <div className="adm-more-panel">
            <div className="adm-more-grid">
              <div className="adm-more-field">
                <label className="adm-more-label">Surname</label>
                <input
                  className="adm-more-input"
                  type="text"
                  placeholder="e.g. dela Cruz"
                  value={filterSurname}
                  onChange={e => setFilterSurname(e.target.value)}
                />
              </div>
              <div className="adm-more-field">
                <label className="adm-more-label">First Name</label>
                <input
                  className="adm-more-input"
                  type="text"
                  placeholder="e.g. Juan"
                  value={filterFirstName}
                  onChange={e => setFilterFirstName(e.target.value)}
                />
              </div>
              <div className="adm-more-field">
                <label className="adm-more-label">Middle Name</label>
                <input
                  className="adm-more-input"
                  type="text"
                  placeholder="e.g. Santos"
                  value={filterMiddleName}
                  onChange={e => setFilterMiddleName(e.target.value)}
                />
              </div>

              {/* => Name Extension is a dropdown matching the options in StudentDetail edit modal */}
              <div className="adm-more-field">
                <label className="adm-more-label">Name Extension</label>
                <select
                  className="adm-more-input"
                  value={filterNameExtension}
                  onChange={e => setFilterNameExtension(e.target.value)}
                >
                  {/* => Empty string = "Any" so the filter is skipped if not set */}
                  <option value="">Any</option>
                  {NAME_EXTENSION_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

            </div>
          </div>
        )}

        {searchError && <p className="adm-search-error">{searchError}</p>}
      </div>

      {/* ════ CONTENT: state or table ════ */}
      {renderState() ?? (
        <>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Full Name</th>
                  <th>Email / Username</th>
                  <th>Account Status</th>
                  <th>Registered</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, idx) => {
                  // => Row number accounts for pagination offset
                  const rowNum = (currentPage - 1) * 10 + idx + 1;
                  return (
                    <tr
                      key={s.public_id}
                      className="adm-table-row"
                      onClick={() => navigate(`/dashboard/students/${s.public_id}`)}
                    >
                      <td className="adm-td-num">{rowNum}</td>
                      <td className="adm-td-name">
                        <span className="adm-student-name">{fullName(s)}</span>
                      </td>
                      <td className="adm-td-email">{s.username}</td>
                      <td>
                        <span className={`adm-badge ${s.is_active ? 'status--active' : 'status--inactive'}`}>
                          {s.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="adm-td-date">{formatDate(s.created_at)}</td>
                      <td className="adm-td-arrow">›</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ════ PAGINATION ════ */}
          {totalPages > 1 && (
            <div className="adm-pagination">
              <button
                className="adm-page-btn adm-page-btn--nav"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                ‹ Prev
              </button>

              {buildPageNumbers().map((p, i) =>
                p === '…'
                  ? <span key={`ellipsis-${i}`} className="adm-page-ellipsis">…</span>
                  : (
                    <button
                      key={p}
                      className={`adm-page-btn ${p === currentPage ? 'adm-page-btn--active' : ''}`}
                      onClick={() => goToPage(p)}
                    >
                      {p}
                    </button>
                  )
              )}

              <button
                className="adm-page-btn adm-page-btn--nav"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next ›
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
