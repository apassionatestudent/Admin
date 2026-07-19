// => admin/pages/Classes/Classes.jsx
// => Displays all Ongoing and Pending classes for admin review, combining
//    TESDA + SHS (mirrors Enrollments.jsx's type/status filter pattern)
// => Also handles cross-status search and Add Class modal (TESDA-only for now)

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import './Classes.css';

import searchIcon from '../../assets/icons/magnifying-glass.png';
// => Replace each of these with your actual icon assets - they just need to live at these paths
import emptyClassesIcon from '../../assets/icons/empty-classes.png';
import warningIcon from '../../assets/icons/warning.png';
import closeIcon from '../../assets/icons/close.png';
import chevronIcon from '../../assets/icons/chevron-down.png'; // => rotated via CSS when open, see .adm-chevron--up
import arrowIcon from '../../assets/icons/chevron-right.png';

// => Maps each status to a CSS modifier class
const statusClass = {
  'Pending':   'status--pending',
  'Ongoing':   'status--ongoing',
  'Concluded': 'status--concluded',
};

// => Formats a DATE string (YYYY-MM-DD) to "Jan 1, 2025"
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const datePart = String(dateStr).slice(0, 10);
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
};

// => Empty search filters - used for reset
// => program_type/cluster added for SHS; course_name/sector/instructor_name stay TESDA-only
// => No track filter - stakeholders only offer a single track, so it's not
//    a meaningful thing to filter by
const EMPTY_FILTERS = {
  course_name:     '',
  instructor_name: '',
  status:          '',
  sector:          '',
  program_type:    '',
  cluster:         '',
  start_date_from: '',
  start_date_to:   '',
};

// => Initial state for the Add Class form
// => TESDA-only - the Add Class modal only creates tesda_classes rows
const EMPTY_CLASS_FORM = {
  course_id:                   '',
  instructor_id:               '',
  start_date:                  '',
  end_date:                    '',
  required_number_of_students: '',
  max_students:                '',
  remarks:                     '',
};

export default function Classes() {
  const navigate = useNavigate();

  // => Default classes list (Ongoing + Pending), combining TESDA + SHS
  const [classes,  setClasses]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  // => Search state
  const [filters,       setFilters]       = useState(EMPTY_FILTERS);
  const [moreOpen,      setMoreOpen]      = useState(false);
  const [searchResults, setSearchResults] = useState(null); // => null = not searched yet
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError,   setSearchError]   = useState(null);

  // => Client-side ONLY filters (type + status) - never trigger a re-fetch,
  //    they just filter whatever's already loaded in `classes` / `searchResults`
  //    Mirrors Enrollments.jsx's typeFilter/statusFilter pattern
  const [typeFilter,   setTypeFilter]   = useState('ALL'); // => 'ALL' | 'TESDA' | 'SHS'
  const [statusFilter, setStatusFilter] = useState('ALL'); // => 'ALL' | one of statusClass's keys

  // => Cache for sector/cluster dropdowns in More Options
  // => useRef so it survives re-renders without triggering one
  const filterOptionsCache = useRef(null);
  const [filterOptions, setFilterOptions] = useState({ sectors: [], clusters: [] });

  // => Fetch sectors and clusters for the More Options dropdowns
  // => Must live inside the component so it can access filterOptionsCache and setFilterOptions
  const fetchFilterOptions = async () => {
    if (filterOptionsCache.current) {
      // => Already fetched this session, reuse cached data
      setFilterOptions(filterOptionsCache.current);
      return;
    }
    try {
      const res = await fetch('/api/admin/classes/form-options', {
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json();
      const extracted = { sectors: data.sectors, clusters: data.clusters };
      // => Store in ref (persists without re-render) and state (drives the UI)
      filterOptionsCache.current = extracted;
      setFilterOptions(extracted);
    } catch {
      // => Silently fail - dropdowns just stay empty
    }
  };

  // => Add Class modal state
  const [modalOpen,    setModalOpen]    = useState(false);
  const [formOptions,  setFormOptions]  = useState({ courses: [], instructors: [] });
  const [classForm,    setClassForm]    = useState(EMPTY_CLASS_FORM);
  const [formError,    setFormError]    = useState(null);
  const [formSaving,   setFormSaving]   = useState(false);

  // => Ref to abort stale search requests
  const abortRef = useRef(null);

  // => Fetch default (Ongoing + Pending) classes on mount - combined TESDA + SHS
  useEffect(() => {
    const fetchClasses = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/classes', {
          credentials: 'include', // => sends the httpOnly admin JWT cookie
        });
        if (!res.ok) throw new Error('Failed to fetch classes.');
        const data = await res.json();
        setClasses(data.classes);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchClasses();
  }, []);

  // => Navigate to ClassDetail on row click
  // => TESDA-only for now - there's no SHS class detail page yet (mirrors
  //    how shsEnrollmentDetail.jsx was built separately from tesdaEnrollmentDetail.jsx;
  //    that split hasn't happened for classes yet). SHS rows are a no-op click
  //    until that page exists.
  const handleRowClick = (publicId, classType) => {
    if (classType === 'SHS') return;
    // => Route must match App.jsx: /dashboard/classes/:publicId
    navigate(`/dashboard/classes/${publicId}`);
  };

  // => Build query string from non-empty filters only
  const buildQuery = (f) => {
    const params = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => {
      if (v && String(v).trim()) params.set(k, String(v).trim());
    });
    return params.toString();
  };

  // => Run search against /api/admin/classes/search
  const handleSearch = async () => {
    const query = buildQuery(filters);
    if (!query) return;

    // => Cancel any in-flight search
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setSearchLoading(true);
    setSearchError(null);
    setSearchResults(null);

    try {
      const res = await fetch(`/api/admin/classes/search?${query}`, {
        credentials: 'include',
        signal: abortRef.current.signal,
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Search failed.');
      }
      const data = await res.json();
      setSearchResults(data.classes);
    } catch (err) {
      if (err.name === 'AbortError') return; // => stale request, ignore
      setSearchError(err.message);
    } finally {
      setSearchLoading(false);
    }
  };

  // => Allow pressing Enter in search inputs to trigger search
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

  
  // ADD CLASS MODAL HANDLERS
  

  // => Fetch form options (courses, instructors) when modal opens
  const handleOpenModal = async () => {
    setClassForm(EMPTY_CLASS_FORM);
    setFormError(null);
    setModalOpen(true);

    try {
      const res = await fetch('/api/admin/classes/form-options', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load form options.');
      const data = await res.json();
      setFormOptions(data);

      // => Also populate the More Options filter cache from the same fetch
      // => So if modal opens first, More Options dropdowns are already ready
      if (!filterOptionsCache.current) {
        const extracted = { sectors: data.sectors, clusters: data.clusters };
        filterOptionsCache.current = extracted;
        setFilterOptions(extracted);
      }
    } catch (err) {
      setFormError('Could not load form options. Please try again.');
    }
  };

  const handleCloseModal = () => {
    if (formSaving) return; // => prevent close mid-save
    setModalOpen(false);
    setFormError(null);
  };

  // => Submit the new class form
  const handleCreateClass = async () => {
    setFormError(null);
    setFormSaving(true);

    try {
      const res = await fetch('/api/admin/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...classForm,
          // => Send as numbers, not strings
          course_id:                   Number(classForm.course_id),
          instructor_id:               classForm.instructor_id ? Number(classForm.instructor_id) : null,
          required_number_of_students: Number(classForm.required_number_of_students),
          max_students:                Number(classForm.max_students),
        }),
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to create class.');

      // => Close modal and navigate straight to the new class's detail page
      setModalOpen(false);
      navigate(`/dashboard/classes/${body.class.public_id}`);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setFormSaving(false);
    }
  };

  // => Determine what's currently displayed
  const isSearchMode = searchResults !== null;

  // => Applies type/status filters in memory only - no fetch, no API call
  //    Mirrors Enrollments.jsx's applyFilters
  const applyFilters = (rows) => rows.filter(r =>
    (typeFilter === 'ALL'   || r.program_type === typeFilter) &&
    (statusFilter === 'ALL' || r.status === statusFilter)
  );

  // => Split default classes into two priority buckets, then run them
  //    through the client-side type/status filters
  const ongoing = applyFilters(classes.filter(c => c.status === 'Ongoing'));
  const pending = applyFilters(classes.filter(c => c.status === 'Pending'));

  return (
    <div className="adm-classes-page">

      {/* ════════════════════════════════════
          PAGE HEADER
          ════════════════════════════════════ */}
      <div className="adm-classes-header">
        <div>
          <h1 className="adm-classes-title">Classes</h1>
          <p className="adm-classes-subtitle">
            {isSearchMode
              ? <>Showing search results - <strong>{searchResults.length}</strong> class{searchResults.length !== 1 ? 'es' : ''} found.</>
              : <>Showing <strong>Ongoing</strong> and <strong>Pending</strong> classes.</>
            }
          </p>
        </div>

        {/* => Live count badge - only shown in default mode */}
        {!loading && !error && !isSearchMode && (
          <div className="adm-classes-count">
            <span className="adm-classes-count-num">{classes.length}</span>
            <span className="adm-classes-count-label">active classes</span>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════
          SEARCH BAR
          ════════════════════════════════════ */}
      <div className="adm-search-wrap">

        {/* => Primary search row: course name + Search button + More Options toggle */}
        <div className="adm-search-row">
          <input
            type="text"
            className="adm-search-input"
            placeholder="Search by course name…"
            value={filters.course_name}
            onChange={e => setFilters(f => ({ ...f, course_name: e.target.value }))}
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
          {/* <button
            className={`adm-more-btn ${moreOpen ? 'adm-more-btn--open' : ''}`}
            onClick={() => setMoreOpen(o => !o)}
          >
            More Options {moreOpen ? '▲' : '▼'}
          </button> */}
          <button
            className={`adm-more-btn ${moreOpen ? 'adm-more-btn--open' : ''}`}
            onClick={() => {
              const next = !moreOpen;
              setMoreOpen(next);
              // => Fetch options the first time the panel is opened
              if (next) fetchFilterOptions();
            }}
          >
            More Options
            <img
              className={`adm-chevron ${moreOpen ? 'adm-chevron--up' : ''}`}
              src={chevronIcon}
              alt=""
            />
          </button>
          {isSearchMode && (
            <button className="adm-clear-btn" onClick={handleClearSearch}>
              <img className="adm-btn-icon" src={closeIcon} alt="" /> Clear Search
            </button>
          )}
        </div>

        {/* => Collapsible More Options panel - filters based on tesda_classes/shs_classes */}
        {moreOpen && (
          <div className="adm-more-panel">
            <div className="adm-more-grid">

              {/* => Class Type comes first - it determines which fields below
                     even show up. Switching type clears the other type's
                     stale filter values so a leftover Cluster value doesn't
                     silently apply once you're back on TESDA. */}
              <div className="adm-more-field">
                <label className="adm-more-label">Class Type</label>
                <select
                  className="adm-more-input"
                  value={filters.program_type}
                  onChange={e => {
                    const nextType = e.target.value;
                    setFilters(f => ({
                      ...f,
                      program_type: nextType,
                      instructor_name: '',
                      sector: '',
                      cluster: '',
                    }));
                  }}
                >
                  <option value="">- Any -</option>
                  <option value="TESDA">TESDA</option>
                  <option value="SHS">SHS</option>
                </select>
              </div>

              {/* => TESDA-only fields - only shown once TESDA is selected */}
              {filters.program_type === 'TESDA' && (
                <>
                  <div className="adm-more-field">
                    <label className="adm-more-label">Instructor</label>
                    <input
                      type="text"
                      className="adm-more-input"
                      placeholder="e.g. Juan dela Cruz"
                      value={filters.instructor_name}
                      onChange={e => setFilters(f => ({ ...f, instructor_name: e.target.value }))}
                      onKeyDown={handleKeyDown}
                    />
                  </div>

                  <div className="adm-more-field">
                    <label className="adm-more-label">Sector</label>
                    {/* => Dropdown pulled from sectors table, cached after first open */}
                    <select
                      className="adm-more-input"
                      value={filters.sector}
                      onChange={e => setFilters(f => ({ ...f, sector: e.target.value }))}
                    >
                      <option value="">- Any -</option>
                      {filterOptions.sectors.map(s => (
                        <option key={s.sector_id} value={s.sector}>
                          {s.sector}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* => SHS-only fields - only shown once SHS is selected */}
              {/* => No Track field - stakeholders only offer a single track */}
              {filters.program_type === 'SHS' && (
                <div className="adm-more-field">
                  <label className="adm-more-label">Cluster</label>
                  {/* => Dropdown pulled from shs_clusters, cached after first open */}
                  <select
                    className="adm-more-input"
                    value={filters.cluster}
                    onChange={e => setFilters(f => ({ ...f, cluster: e.target.value }))}
                  >
                    <option value="">- Any -</option>
                    {filterOptions.clusters.map(c => (
                      <option key={c.cluster_id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* => Status is a fixed set - dropdown is cleaner than free text */}
              <div className="adm-more-field">
                <label className="adm-more-label">Status</label>
                <select
                  className="adm-more-input"
                  value={filters.status}
                  onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                >
                  <option value="">- Any -</option>
                  <option value="Pending">Pending</option>
                  <option value="Ongoing">Ongoing</option>
                  <option value="Concluded">Concluded</option>
                </select>
              </div>

              <div className="adm-more-field">
                <label className="adm-more-label">Start Date From</label>
                <input
                  type="date"
                  className="adm-more-input"
                  value={filters.start_date_from}
                  onChange={e => setFilters(f => ({ ...f, start_date_from: e.target.value }))}
                />
              </div>

              <div className="adm-more-field">
                <label className="adm-more-label">Start Date To</label>
                <input
                  type="date"
                  className="adm-more-input"
                  value={filters.start_date_to}
                  onChange={e => setFilters(f => ({ ...f, start_date_to: e.target.value }))}
                />
              </div>

            </div>
          </div>
        )}

        {/* => Search error */}
        {searchError && (
          <p className="adm-search-error"><img className="adm-inline-icon" src={warningIcon} alt="" /> {searchError}</p>
        )}
      </div>

      {/* ════════════════════════════════════
          FILTER BUTTONS (type + status)
          => Client-side only - toggling these never re-fetches, they just
             re-filter classes/searchResults already sitting in state
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

        <div className="adm-filter-group">
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
            <div className="adm-classes-state">
              <div className="adm-spinner" />
              <p>Searching…</p>
            </div>
          )}

          {!searchLoading && searchResults.length === 0 && (
            <div className="adm-classes-state">
              <span className="adm-state-icon"> <img src={searchIcon} alt="Search" /> </span>
              <p>No classes matched your search.</p>
            </div>
          )}

          {/* => searchResults has rows, but the type/status filters narrowed it to 0 */}
          {!searchLoading && searchResults.length > 0 && applyFilters(searchResults).length === 0 && (
            <div className="adm-classes-state">
              <span className="adm-state-icon"><img src={warningIcon} alt="" /></span>
              <p>No classes match the current Type/Status filters.</p>
            </div>
          )}

          {!searchLoading && applyFilters(searchResults).length > 0 && (
            <section className="adm-classes-section">
              <ClassTable rows={applyFilters(searchResults)} onRowClick={handleRowClick} />
            </section>
          )}
        </>
      )}

      {/* ════════════════════════════════════
          DEFAULT MODE (Ongoing + Pending)
          ════════════════════════════════════ */}
      {!isSearchMode && (
        <>
          {/* Loading state */}
          {loading && (
            <div className="adm-classes-state">
              <div className="adm-spinner" />
              <p>Loading classes…</p>
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <div className="adm-classes-state adm-classes-state--error">
              <span className="adm-state-icon"><img src={warningIcon} alt="" /></span>
              <p>{error}</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && classes.length === 0 && (
            <div className="adm-classes-state">
              <span className="adm-state-icon"> <img src={emptyClassesIcon} alt="No classes" /> </span>
              <p>No active classes found. Add one using the + button below.</p>
            </div>
          )}

          {/* => classes has rows, but type/status filters narrowed both buckets to 0 */}
          {!loading && !error && classes.length > 0 && ongoing.length === 0 && pending.length === 0 && (
            <div className="adm-classes-state">
              <span className="adm-state-icon"><img src={warningIcon} alt="" /></span>
              <p>No classes match the current Type/Status filters.</p>
            </div>
          )}

          {/* => Ongoing group - shown first (already running) */}
          {!loading && !error && ongoing.length > 0 && (
            <section className="adm-classes-section">
              <h2 className="adm-section-label adm-section-label--ongoing">
                Ongoing
                <span className="adm-section-count">{ongoing.length}</span>
              </h2>
              <ClassTable rows={ongoing} onRowClick={handleRowClick} />
            </section>
          )}

          {/* => Pending group */}
          {!loading && !error && pending.length > 0 && (
            <section className="adm-classes-section">
              <h2 className="adm-section-label adm-section-label--pending">
                Pending
                <span className="adm-section-count">{pending.length}</span>
              </h2>
              <ClassTable rows={pending} onRowClick={handleRowClick} />
            </section>
          )}
        </>
      )}

      {/* ════════════════════════════════════
          ADD CLASS FAB (Floating Action Button)
          ════════════════════════════════════ */}
      <button
        className="adm-fab"
        onClick={handleOpenModal}
        title="Add new class"
        aria-label="Add new class"
      >
        {/* => White plus icon on green background */}
        <svg className="adm-fab-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 5V19M5 12H19" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* ════════════════════════════════════
          ADD CLASS MODAL
          ════════════════════════════════════ */}
      {modalOpen && (
        <div className="adm-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) handleCloseModal(); }}>
          <div className="adm-modal-box adm-modal-box--form">

            <div className="adm-modal-header">
              <span className="adm-modal-title">Add New Class</span>
              <button className="adm-modal-close" onClick={handleCloseModal} disabled={formSaving}>
                <img src={closeIcon} alt="Close" />
              </button>
            </div>

            <div className="adm-modal-body">

              {/* => Course */}
              <div className="adm-form-group">
                <label className="adm-form-label">Course <span className="adm-form-required">*</span></label>
                <select
                  className="adm-form-select"
                  value={classForm.course_id}
                  onChange={e => setClassForm(f => ({ ...f, course_id: e.target.value }))}
                >
                  <option value="">- Select a course -</option>
                  {formOptions.courses.map(c => (
                    <option key={c.course_id} value={c.course_id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* => Instructor (optional - nullable per schema) */}
              <div className="adm-form-group">
                <label className="adm-form-label">Instructor <span className="adm-form-optional">(optional)</span></label>
                <select
                  className="adm-form-select"
                  value={classForm.instructor_id}
                  onChange={e => setClassForm(f => ({ ...f, instructor_id: e.target.value }))}
                >
                  <option value="">- Assign later -</option>
                  {formOptions.instructors.map(i => (
                    <option key={i.instructor_id} value={i.instructor_id}>{i.instructor_full_name}</option>
                  ))}
                </select>
              </div>

              {/* => Start Date + End Date side by side */}
              <div className="adm-form-row">
                <div className="adm-form-group">
                  <label className="adm-form-label">Start Date <span className="adm-form-required">*</span></label>
                  <input
                    type="date"
                    className="adm-form-input"
                    value={classForm.start_date}
                    onChange={e => setClassForm(f => ({ ...f, start_date: e.target.value }))}
                  />
                </div>

                <div className="adm-form-group">
                  <label className="adm-form-label">End Date <span className="adm-form-required">*</span></label>
                  <input
                    type="date"
                    className="adm-form-input"
                    value={classForm.end_date}
                    onChange={e => setClassForm(f => ({ ...f, end_date: e.target.value }))}
                  />
                </div>
              </div>

              {/* => Required Students + Max Students side by side */}
              <div className="adm-form-row">
                <div className="adm-form-group">
                  <label className="adm-form-label">Required Students <span className="adm-form-required">*</span></label>
                  <input
                    type="number"
                    className="adm-form-input"
                    min="1"
                    placeholder="e.g. 10"
                    value={classForm.required_number_of_students}
                    onChange={e => setClassForm(f => ({ ...f, required_number_of_students: e.target.value }))}
                  />
                </div>

                <div className="adm-form-group">
                  <label className="adm-form-label">Max Students <span className="adm-form-required">*</span></label>
                  <input
                    type="number"
                    className="adm-form-input"
                    min="1"
                    placeholder="e.g. 25"
                    value={classForm.max_students}
                    onChange={e => setClassForm(f => ({ ...f, max_students: e.target.value }))}
                  />
                </div>
              </div>

              {/* => Remarks (optional) */}
              <div className="adm-form-group">
                <label className="adm-form-label">Remarks <span className="adm-form-optional">(optional)</span></label>
                <textarea
                  className="adm-form-textarea"
                  rows={3}
                  placeholder="Any notes about this class…"
                  value={classForm.remarks}
                  onChange={e => setClassForm(f => ({ ...f, remarks: e.target.value }))}
                />
              </div>

              {/* => Form error */}
              {formError && (
                <p className="adm-form-error"><img className="adm-inline-icon" src={warningIcon} alt="" /> {formError}</p>
              )}
            </div>

            <div className="adm-modal-footer">
              <button className="adm-modal-cancel-btn" onClick={handleCloseModal} disabled={formSaving}>
                Cancel
              </button>
              <button
                className="adm-modal-save-btn"
                onClick={handleCreateClass}
                disabled={formSaving}
              >
                {formSaving ? 'Creating…' : 'Create Class'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}


// ClassTable - reusable table sub-component
// => Course/Sector/Instructor columns are TESDA-only; Track/Cluster fill
//    in for SHS rows (course_name/sector/instructor_name are NULL on the
//    SHS side of the UNION ALL, and vice versa - see adminClassModel.js)

function ClassTable({ rows, onRowClick }) {
  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Course / Track</th>
            <th>Sector / Cluster</th>
            <th>Instructor</th>
            <th>Start Date</th>
            <th>End Date</th>
            <th>Enrolled / Max</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const isShs = row.program_type === 'SHS';
            return (
              <tr
                key={row.public_id}
                className="adm-table-row"
                style={{ animationDelay: `${idx * 40}ms`, cursor: isShs ? 'default' : 'pointer' }}
                onClick={() => onRowClick(row.public_id, row.program_type)}
                title={isShs ? 'SHS class detail view is not built yet' : 'View class detail'}
              >
                <td>
                  <span className={`adm-type-badge adm-type-badge--${isShs ? 'shs' : 'tesda'}`}>
                    {row.program_type}
                  </span>
                </td>
                <td className="adm-td-course">
                  <span className="adm-course-name">
                    {isShs ? (row.track ?? '-') : (row.course_name ?? '-')}
                  </span>
                </td>
                <td>{isShs ? (row.cluster ?? '-') : (row.sector ?? '-')}</td>
                <td>{isShs ? '-' : (row.instructor_name ?? <span className="adm-td-unassigned">Unassigned</span>)}</td>
                <td className="adm-td-date">{formatDate(row.start_date)}</td>
                <td className="adm-td-date">{formatDate(row.end_date)}</td>
                <td className="adm-td-slots">
                  {/* => Show enrolled count vs max - highlights if full */}
                  <span className={row.enrolled_count >= row.max_students ? 'adm-slots-full' : ''}>
                    {row.enrolled_count ?? 0}
                  </span>
                  <span className="adm-slots-sep"> / </span>
                  <span>{row.max_students}</span>
                </td>
                <td>
                  <span className={`adm-badge ${statusClass[row.status] || ''}`}>
                    {row.status}
                  </span>
                </td>
                <td className="adm-td-arrow">{isShs ? null : <img src={arrowIcon} alt="" />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
