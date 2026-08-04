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

export default function SupportTickets() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('public'); // => 'public' | 'students'
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  // => Separate from "empty" on purpose, mirrors Courses.jsx's fetchError pattern
  const [fetchError, setFetchError] = useState('');
  

  // => Client-side only, mirrors Courses.jsx's search/filter pattern - never
  //    triggers a re-fetch, just re-filters whatever's already loaded
  const [searchTerm, setSearchTerm] = useState('');
  const [concernTypeFilter, setConcernTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    // => Students tab has no backend yet, only fetch when Public tab is active
    if (activeTab === 'public') {
      fetchTickets();
    }
  }, [activeTab]);

  const fetchTickets = async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await axiosAdmin.get('/api/admin/public-support-tickets');
      setTickets(res.data.data);
    } catch (error) {
      console.error('Failed to fetch public support tickets:', error);
      setFetchError('Failed to load support tickets. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  

  // => Dropdown options built from whatever's already loaded, same as
  //    Courses.jsx's tesdaSectorOptions pattern
  const concernTypeOptions = [...new Set(tickets.map((t) => t.concern_type).filter(Boolean))];

  // => Same in-memory filtering pattern as Courses.jsx's applyTesdaFilters
  const applyFilters = (rows) =>
    rows.filter((t) => {
      const matchesConcernType = concernTypeFilter === 'ALL' || t.concern_type === concernTypeFilter;
      const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;

      const term = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !term ||
        t.full_name?.toLowerCase().includes(term) ||
        t.email?.toLowerCase().includes(term) ||
        t.contact_number?.toLowerCase().includes(term);

      return matchesConcernType && matchesStatus && matchesSearch;
    });

  const filteredTickets = applyFilters(tickets);

  // => Counts for the header badges, computed from the full ticket list
  //    (not filteredTickets) so they stay stable while search/filter
  //    narrows the table below - same idea as Enrollments.jsx's count badge
  const openCount = tickets.filter((t) => t.status === 'Open').length;
  const inProgressCount = tickets.filter((t) => t.status === 'In Progress').length;

  // => Small helper for the status badge's color, purely visual so
  //    admins can scan the table faster
  const statusClass = (status) => `status-badge status-badge-${status.toLowerCase().replace(' ', '-')}`;

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
                Showing <strong>{tickets.length}</strong> public ticket{tickets.length !== 1 ? 's' : ''}.
              </>
            ) : (
              'Student ticket support is not yet available.'
            )}
          </p>
        </div>

        {/* => Open / In Progress count badges, Public tab only - mirrors
               Enrollments.jsx's adm-enroll-count pattern */}
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
        // => Placeholder until the private support_tickets admin feature is
        //    built, this table stays out of scope for this build per the
        //    original brief ("finish public-site work fully first")
        <div className="tickets-status-block">
          <p>Student support tickets are coming soon.</p>
        </div>
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
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="adm-filter-wrap">
            <div className="adm-filter-group">
              <span className="adm-filter-label">Concern Type</span>
              <select
                className="adm-filter-select"
                value={concernTypeFilter}
                onChange={(e) => setConcernTypeFilter(e.target.value)}
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
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All</option>
                {ALLOWED_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
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
                {filteredTickets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="tickets-empty">
                      {/* => Distinguishes "nothing matches the filter" from a
                             genuinely empty list, same as Courses.jsx */}
                      {tickets.length > 0
                        ? 'No tickets match this filter.'
                        : 'No public support tickets yet.'}
                    </td>
                  </tr>
                ) : (
                  filteredTickets.map((ticket) => (
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
        </>
      )}
    </main>
  );
}