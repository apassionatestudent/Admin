import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosAdmin from '../../utils/axiosAdmin.js';
import LoadingState from '../../components/LoadingState/loadingState.jsx';
import './SupportTickets.css';

// => The 4 allowed statuses, duplicated by hand from
//    publicSupportTicketService.js's ALLOWED_STATUSES - no shared code
//    between backend and frontend, so this list must be updated in both
//    places if it ever changes
const ALLOWED_STATUSES = ['Open', 'In Progress', 'Resolved', 'Unresolved'];

// => How many rows per page, matches the 10-per-page convention used by
//    other paginated admin tables
const TICKETS_PER_PAGE = 10;

// => Delays the actual API call until typing pauses, so search doesn't
//    fire a request on every keystroke - own copy, no shared debounce
//    utility per the no-shared-abstraction convention
const useDebouncedValue = (value, delayMs) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
};

export default function SupportTickets() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('public'); // => 'public' | 'students'

  // => Public tab state - tickets holds only the CURRENT PAGE's rows now,
  //    not the full table, per the move to server-side pagination
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [concernTypeFilter, setConcernTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [hideClosedPublicTickets, setHideClosedPublicTickets] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [inProgressCount, setInProgressCount] = useState(0);
  const [concernTypeOptions, setConcernTypeOptions] = useState([]);
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 350);

  // => Students tab - same shape as the Public tab above, kept fully
  //    separate so switching tabs doesn't clear whichever page was loaded
  const [studentTickets, setStudentTickets] = useState([]);
  const [studentLoading, setStudentLoading] = useState(true);
  const [studentFetchError, setStudentFetchError] = useState('');
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [studentConcernTypeFilter, setStudentConcernTypeFilter] = useState('ALL');
  const [studentStatusFilter, setStudentStatusFilter] = useState('ALL');
  const [hideClosedStudentTickets, setHideClosedStudentTickets] = useState(true);
  const [studentPage, setStudentPage] = useState(1);
  const [studentTotalPages, setStudentTotalPages] = useState(1);
  const [studentTotalCount, setStudentTotalCount] = useState(0);
  const [studentOpenCount, setStudentOpenCount] = useState(0);
  const [studentInProgressCount, setStudentInProgressCount] = useState(0);
  const [studentConcernTypeOptions, setStudentConcernTypeOptions] = useState([]);
  const debouncedStudentSearchTerm = useDebouncedValue(studentSearchTerm, 350);

  // => Public tab fetch - re-runs whenever the tab is active and any
  //    filter/search/page value changes. Resetting to page 1 on filter
  //    change happens in the filter's own onChange handlers below.
  useEffect(() => {
    if (activeTab === 'public') {
      fetchTickets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, page, debouncedSearchTerm, concernTypeFilter, statusFilter, hideClosedPublicTickets]);

  // => Students tab fetch - same trigger shape as the Public tab
  useEffect(() => {
    if (activeTab === 'students') {
      fetchStudentTickets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, studentPage, debouncedStudentSearchTerm, studentConcernTypeFilter, studentStatusFilter, hideClosedStudentTickets]);

  const fetchTickets = async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await axiosAdmin.get('/api/admin/public-support-tickets', {
        params: {
          page,
          limit: TICKETS_PER_PAGE,
          search: debouncedSearchTerm,
          concernType: concernTypeFilter,
          status: statusFilter,
          hideClosed: hideClosedPublicTickets,
        },
      });
      setTickets(res.data.data);
      setTotalPages(res.data.totalPages);
      setTotalCount(res.data.totalCount);
      setOpenCount(res.data.openCount);
      setInProgressCount(res.data.inProgressCount);
      setConcernTypeOptions(res.data.concernTypeOptions);
    } catch (error) {
      console.error('Failed to fetch public support tickets:', error);
      setFetchError('Failed to load support tickets. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // => Fetches the private, student-scoped tickets - separate table/endpoint
  //    from the Public tab above
  const fetchStudentTickets = async () => {
    setStudentLoading(true);
    setStudentFetchError('');
    try {
      const res = await axiosAdmin.get('/api/admin/support-tickets', {
        params: {
          page: studentPage,
          limit: TICKETS_PER_PAGE,
          search: debouncedStudentSearchTerm,
          concernType: studentConcernTypeFilter,
          status: studentStatusFilter,
          hideClosed: hideClosedStudentTickets,
        },
      });
      setStudentTickets(res.data.data);
      setStudentTotalPages(res.data.totalPages);
      setStudentTotalCount(res.data.totalCount);
      setStudentOpenCount(res.data.openCount);
      setStudentInProgressCount(res.data.inProgressCount);
      setStudentConcernTypeOptions(res.data.concernTypeOptions);
    } catch (error) {
      console.error('Failed to fetch student support tickets:', error);
      setStudentFetchError('Failed to load support tickets. Please try again.');
    } finally {
      setStudentLoading(false);
    }
  };

  // => Small helper for the status badge's color, purely visual so
  //    admins can scan the table faster
  const statusClass = (status) => `status-badge status-badge-${status.toLowerCase().replace(' ', '-')}`;

  // => Builds the student's display name from student_profile columns -
  //    same first/middle/last/extension order used elsewhere (e.g. StudentDetail.jsx)
  // => name_extension can be the literal string "N/A" rather than null/empty,
  //    so it's excluded explicitly, not just filtered for truthiness
  const studentFullName = (t) =>
    [t.first_name, t.middle_name, t.last_name, t.name_extension]
      .filter((part) => part && part.trim().toUpperCase() !== 'N/A')
      .join(' ');

  // => Resets to page 1 whenever a filter/search value changes - without
  //    this, changing a filter while sitting on e.g. page 3 could land on
  //    an out-of-range page with no rows to show
  const handlePublicSearchChange = (value) => { setSearchTerm(value); setPage(1); };
  const handlePublicConcernTypeChange = (value) => { setConcernTypeFilter(value); setPage(1); };
  const handlePublicStatusChange = (value) => { setStatusFilter(value); setPage(1); };
  const handlePublicHideClosedChange = (value) => { setHideClosedPublicTickets(value); setPage(1); };

  const handleStudentSearchChange = (value) => { setStudentSearchTerm(value); setStudentPage(1); };
  const handleStudentConcernTypeChange = (value) => { setStudentConcernTypeFilter(value); setStudentPage(1); };
  const handleStudentStatusChange = (value) => { setStudentStatusFilter(value); setStudentPage(1); };
  const handleStudentHideClosedChange = (value) => { setHideClosedStudentTickets(value); setStudentPage(1); };

  return (
    <main className="tickets-page">
      <div className="tickets-header">
        <div>
          {/* => "Support Tickets | Public" / "Support Tickets | Students",
                 mirrors Courses.jsx's "Courses | TESDA" pattern */}
          <h2>Support Tickets | {activeTab === 'public' ? 'Public' : 'Students'}</h2>
          <p className="tickets-subtitle">
            {activeTab === 'public' ? (
              <>
                Showing <strong>{tickets.length}</strong> of <strong>{totalCount}</strong> public ticket{totalCount !== 1 ? 's' : ''}.
              </>
            ) : (
              <>
                Showing <strong>{studentTickets.length}</strong> of <strong>{studentTotalCount}</strong> student ticket{studentTotalCount !== 1 ? 's' : ''}.
              </>
            )}
          </p>
        </div>

        {/* => Open / In Progress count badges - mirrors Enrollments.jsx's
               adm-enroll-count pattern, shown for whichever tab is active */}
        {activeTab === 'public' && !loading && !fetchError && (
          <div className="tickets-count-wrap">
            <div className="tickets-count-item tickets-count-item--open">
              <span className="tickets-count-num">{openCount}</span>
              <span className="tickets-count-label">Open</span>
            </div>
            <div className="tickets-count-item tickets-count-item--in-progress">
              <span className="tickets-count-num">{inProgressCount}</span>
              <span className="tickets-count-label">In Progress</span>
            </div>
          </div>
        )}
        {activeTab === 'students' && !studentLoading && !studentFetchError && (
          <div className="tickets-count-wrap">
            <div className="tickets-count-item tickets-count-item--open">
              <span className="tickets-count-num">{studentOpenCount}</span>
              <span className="tickets-count-label">Open</span>
            </div>
            <div className="tickets-count-item tickets-count-item--in-progress">
              <span className="tickets-count-num">{studentInProgressCount}</span>
              <span className="tickets-count-label">In Progress</span>
            </div>
          </div>
        )}
      </div>

      <div className="tickets-tabs-row">
        <div className="tickets-tabs">
          <button
            className={activeTab === 'public' ? 'tickets-tab-btn tickets-tab-btn--active' : 'tickets-tab-btn'}
            onClick={() => setActiveTab('public')}
          >
            Public
          </button>
          <button
            className={activeTab === 'students' ? 'tickets-tab-btn tickets-tab-btn--active' : 'tickets-tab-btn'}
            onClick={() => setActiveTab('students')}
          >
            Students
          </button>
        </div>
      </div>

      {activeTab === 'students' ? (
        <>
          {/* ════════════════════════════════════
              SEARCH + FILTER ROW (Students tab)
              => Own state, no concern-type filter since it doesn't apply
                 to student tickets
              ════════════════════════════════════ */}
          <div className="adm-search-wrap">
            <div className="adm-search-row">
              <input
                type="text"
                className="adm-search-input"
                placeholder="Search by name, email, contact number, or subject..."
                value={studentSearchTerm}
                onChange={(e) => handleStudentSearchChange(e.target.value)}
              />
            </div>
          </div>

          <div className="adm-filter-wrap">
            <div className="adm-filter-group">
              <span className="adm-filter-label">Concern Type</span>
              <select
                className="adm-filter-select"
                value={studentConcernTypeFilter}
                onChange={(e) => handleStudentConcernTypeChange(e.target.value)}
              >
                <option value="ALL">All</option>
                {studentConcernTypeOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="adm-filter-group">
              <span className="adm-filter-label">Status</span>
              <select
                className="adm-filter-select"
                value={studentStatusFilter}
                onChange={(e) => handleStudentStatusChange(e.target.value)}
              >
                <option value="ALL">All</option>
                {ALLOWED_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <label className="adm-filter-group tickets-hide-closed-toggle">
              <input
                type="checkbox"
                checked={hideClosedStudentTickets}
                onChange={(e) => handleStudentHideClosedChange(e.target.checked)}
              />
              <span className="adm-filter-label">Hide Resolved / Unresolved</span>
            </label>
          </div>

          {studentLoading ? (
            <LoadingState message="Loading support tickets…" />
          ) : studentFetchError ? (
            <LoadingState variant="error" message={studentFetchError} onRetry={fetchStudentTickets} />
          ) : (
            <table className="tickets-table">
              <thead>
                <tr>
                  <th>Full Name</th>
                  <th>Concern Type</th>
                  <th>Subject</th>
                  <th>Message</th>
                  <th>Submitted</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {studentTickets.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="tickets-empty">
                      {studentTotalCount > 0
                        ? 'No tickets match this filter.'
                        : 'No student support tickets yet.'}
                    </td>
                  </tr>
                ) : (
                  studentTickets.map((ticket) => (
                    <tr
                      key={ticket.public_id}
                      className="tickets-row"
                      onClick={() => navigate(`/dashboard/support-tickets/students/${ticket.public_id}`)}
                    >
                      {/* => Contact Number and Email dropped from this table -
                             the ticket is already tied to a real student
                             account via student_id, so those two only need
                             to show up on the detail page, not here */}
                      <td>{studentFullName(ticket)}</td>
                      <td>{ticket.concern_type}</td>
                      <td>{ticket.subject}</td>
                      <td className="concern-cell" title={ticket.message}>
                        {ticket.message}
                      </td>
                      <td>{new Date(ticket.created_at).toLocaleDateString('en-PH', {
                        year: 'numeric', month: 'short', day: 'numeric',
                      })}</td>
                      <td>
                        <span className={statusClass(ticket.status)}>{ticket.status}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {!studentLoading && !studentFetchError && studentTotalPages > 1 && (
            <div className="tickets-pagination">
              <button
                className="tickets-page-btn"
                onClick={() => setStudentPage((p) => Math.max(1, p - 1))}
                disabled={studentPage === 1}
              >
                Prev
              </button>
              {Array.from({ length: studentTotalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  className={`tickets-page-btn ${p === studentPage ? 'tickets-page-btn--active' : ''}`}
                  onClick={() => setStudentPage(p)}
                >
                  {p}
                </button>
              ))}
              <button
                className="tickets-page-btn"
                onClick={() => setStudentPage((p) => Math.min(studentTotalPages, p + 1))}
                disabled={studentPage === studentTotalPages}
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          {/* ════════════════════════════════════
              SEARCH + FILTER ROW
              => Same duplicated adm-search-wrap / adm-filter-wrap classes
                 as Courses.css, per the no-shared-abstraction convention
              ════════════════════════════════════ */}
          <div className="adm-search-wrap">
            <div className="adm-search-row">
              <input
                type="text"
                className="adm-search-input"
                placeholder="Search by name, email, or contact number..."
                value={searchTerm}
                onChange={(e) => handlePublicSearchChange(e.target.value)}
              />
            </div>
          </div>

          <div className="adm-filter-wrap">
            <div className="adm-filter-group">
              <span className="adm-filter-label">Concern Type</span>
              <select
                className="adm-filter-select"
                value={concernTypeFilter}
                onChange={(e) => handlePublicConcernTypeChange(e.target.value)}
              >
                <option value="ALL">All</option>
                {concernTypeOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="adm-filter-group">
              <span className="adm-filter-label">Status</span>
              <select
                className="adm-filter-select"
                value={statusFilter}
                onChange={(e) => handlePublicStatusChange(e.target.value)}
              >
                <option value="ALL">All</option>
                {ALLOWED_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <label className="adm-filter-group tickets-hide-closed-toggle">
              <input
                type="checkbox"
                checked={hideClosedPublicTickets}
                onChange={(e) => handlePublicHideClosedChange(e.target.checked)}
              />
              <span className="adm-filter-label">Hide Resolved / Unresolved</span>
            </label>
          </div>

          {loading ? (
            <LoadingState message="Loading support tickets…" />
          ) : fetchError ? (
            <LoadingState variant="error" message={fetchError} onRetry={fetchTickets} />
          ) : (
            <table className="tickets-table">
              <thead>
                <tr>
                  <th>Full Name</th>
                  <th>Contact Number</th>
                  <th>Email</th>
                  <th>Concern Type</th>
                  <th>Concern</th>
                  <th>Submitted</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tickets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="tickets-empty">
                      {/* => Distinguishes "nothing matches the filter" from a
                             genuinely empty list, same as Courses.jsx */}
                      {totalCount > 0
                        ? 'No tickets match this filter.'
                        : 'No public support tickets yet.'}
                    </td>
                  </tr>
                ) : (
                  tickets.map((ticket) => (
                    <tr
                      key={ticket.public_id}
                      className="tickets-row"
                      onClick={() => navigate(`/dashboard/support-tickets/${ticket.public_id}`)}
                    >
                      <td>{ticket.full_name}</td>
                      <td>{ticket.contact_number}</td>
                      <td>{ticket.email}</td>
                      <td>{ticket.concern_type}</td>
                      {/* => Plain JSX interpolation only, React auto-escapes this -
                             never use dangerouslySetInnerHTML on public-submitted
                             fields like concern, per the XSS note in the brief */}
                      <td className="concern-cell" title={ticket.concern}>
                        {ticket.concern}
                      </td>
                      <td>{new Date(ticket.created_at).toLocaleDateString('en-PH', {
                        year: 'numeric', month: 'short', day: 'numeric',
                      })}</td>
                      <td>
                        {/* => Read-only badge now, status editing moved to the
                               detail page reached by clicking this row */}
                        <span className={statusClass(ticket.status)}>{ticket.status}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {!loading && !fetchError && totalPages > 1 && (
            <div className="tickets-pagination">
              <button
                className="tickets-page-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  className={`tickets-page-btn ${p === page ? 'tickets-page-btn--active' : ''}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ))}
              <button
                className="tickets-page-btn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}