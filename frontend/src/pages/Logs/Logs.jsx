// => admin/frontend/src/pages/Logs/Logs.jsx
// => Own copy of the search/filter/pagination pattern, no shared file between
//    admin pages per the no-shared-abstraction convention - see SupportTickets.jsx

import React, { useEffect, useState } from 'react';
import axiosAdmin from '../../utils/axiosAdmin.js';
import LoadingState from '../../components/LoadingState/loadingState.jsx';
import { ACTIVITY_ACTIONS } from '../../constants/activityActions.js';
import chevronDown from '../../assets/icons/chevron-down.png';
import './logs.css';

// => How many rows per page, matches the 10-per-page convention used by
//    other paginated admin tables
const LOGS_PER_PAGE = 10;

// => Delays the actual API call until typing pauses, own copy per the
//    no-shared-abstraction convention, same shape as SupportTickets.jsx's
const useDebouncedValue = (value, delayMs) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
};

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('ALL');
  const [actorTypeFilter, setActorTypeFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');

  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [logsToday, setLogsToday] = useState(0);
  const [entityTypeOptions, setEntityTypeOptions] = useState([]);
  const [actorTypeOptions, setActorTypeOptions] = useState([]);

  // => Which row is expanded to show its full action_detail, null when none
  const [expandedLogId, setExpandedLogId] = useState(null);

  const debouncedSearchTerm = useDebouncedValue(searchTerm, 350);
  const totalPages = Math.max(1, Math.ceil(totalCount / LOGS_PER_PAGE));

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearchTerm, entityTypeFilter, actorTypeFilter, actionFilter]);

  const fetchLogs = async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await axiosAdmin.get('/api/admin/logs', {
        params: {
          page,
          pageSize: LOGS_PER_PAGE,
          search: debouncedSearchTerm || undefined,
          entityType: entityTypeFilter === 'ALL' ? undefined : entityTypeFilter,
          actorType: actorTypeFilter === 'ALL' ? undefined : actorTypeFilter,
          action: actionFilter === 'ALL' ? undefined : actionFilter,
        },
      });
      setLogs(res.data.logs);
      setTotalCount(res.data.total);
      setLogsToday(res.data.logsToday);
      setEntityTypeOptions(res.data.entityTypes);
      setActorTypeOptions(res.data.actorTypes);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      setFetchError('Failed to load logs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // => Resets to page 1 whenever a filter/search value changes - without
  //    this, changing a filter while sitting on e.g. page 3 could land on
  //    an out-of-range page with no rows to show
  const handleSearchChange = (value) => { setSearchTerm(value); setPage(1); };
  const handleEntityTypeChange = (value) => { setEntityTypeFilter(value); setPage(1); };
  const handleActorTypeChange = (value) => { setActorTypeFilter(value); setPage(1); };
  const handleActionChange = (value) => { setActionFilter(value); setPage(1); };

  const toggleExpand = (logId) => {
    setExpandedLogId((prev) => (prev === logId ? null : logId));
  };

  // => Turns 'STATUS_CHANGE' into 'Status Change' for display
  const formatActionLabel = (value) =>
    value.toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  // => Three-tier color grouping, same spirit as SupportTickets' statusClass -
  //    lets admins scan the table by rough category without reading every cell
  const actionBadgeClass = (action) => {
    const positive = ['CREATE', 'INVITE', 'DOCUMENT_ADD', 'RELEASE', 'RESTORE', 'REACTIVATE'];
    const negative = ['DELETE', 'SOFT_DELETE', 'VOID', 'SUSPEND'];
    const tier = positive.includes(action) ? 'positive' : negative.includes(action) ? 'negative' : 'neutral';
    return `logs-action-badge logs-action-badge-${tier}`;
  };

  const formatDate = (isoString) =>
    new Date(isoString).toLocaleString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });

  // => Builds a capped list of page buttons instead of rendering one button
  //    per page. Always shows page 1 and the last page, plus a small window
  //    of neighbors around the current page. Gaps are filled with '...'
  //    so the bar stays a fixed width no matter how many pages exist.
  // => delta = how many neighbor pages to show on each side of current
  const getPageNumbers = (current, total) => {
    const delta = 1;
    const range = [];
    const withDots = [];
    let lastAdded;

    for (let i = 1; i <= total; i++) {
      const isEdge = i === 1 || i === total;
      const isNearCurrent = i >= current - delta && i <= current + delta;
      if (isEdge || isNearCurrent) {
        range.push(i);
      }
    }

    range.forEach((i) => {
      if (lastAdded) {
        if (i - lastAdded === 2) {
          // => Single-page gap, just show the number instead of '...'
          withDots.push(lastAdded + 1);
        } else if (i - lastAdded > 2) {
          withDots.push('...');
        }
      }
      withDots.push(i);
      lastAdded = i;
    });

    return withDots;
  };

  return (
    <main className="logs-page">
      <div className="logs-header">
        <div>
          <h2>Logs</h2>
          <p className="logs-subtitle">
            Showing <strong>{logs.length}</strong> of <strong>{totalCount}</strong> log{totalCount !== 1 ? 's' : ''}.
          </p>
        </div>

        {!loading && !fetchError && (
          <div className="logs-count-wrap">
            <div className="logs-count-item">
              <span className="logs-count-num">{logsToday}</span>
              <span className="logs-count-label">Today</span>
            </div>
            <div className="logs-count-item">
              <span className="logs-count-num">{totalCount}</span>
              <span className="logs-count-label">Total</span>
            </div>
          </div>
        )}
      </div>

      <div className="adm-search-wrap">
        <div className="adm-search-row">
          <input
            type="text"
            className="adm-search-input"
            placeholder="Search by actor name..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
      </div>

      <div className="adm-filter-wrap">
        <div className="adm-filter-group">
          <span className="adm-filter-label">Entity Type</span>
          <select
            className="adm-filter-select"
            value={entityTypeFilter}
            onChange={(e) => handleEntityTypeChange(e.target.value)}
          >
            <option value="ALL">All</option>
            {entityTypeOptions.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        <div className="adm-filter-group">
          <span className="adm-filter-label">Actor Type</span>
          <select
            className="adm-filter-select"
            value={actorTypeFilter}
            onChange={(e) => handleActorTypeChange(e.target.value)}
          >
            <option value="ALL">All</option>
            {actorTypeOptions.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        <div className="adm-filter-group">
          <span className="adm-filter-label">Action</span>
          <select
            className="adm-filter-select"
            value={actionFilter}
            onChange={(e) => handleActionChange(e.target.value)}
          >
            <option value="ALL">All</option>
            {Object.values(ACTIVITY_ACTIONS).map((value) => (
              <option key={value} value={value}>{formatActionLabel(value)}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingState message="Loading logs…" />
      ) : fetchError ? (
        <LoadingState variant="error" message={fetchError} onRetry={fetchLogs} />
      ) : (
        // => wrapper enables horizontal scroll on narrow screens instead of
        //    crushing columns unreadably - same pattern as sdaw-table-wrap / faqw-table-wrap
        <div className="logs-table-wrap">
        <table className="logs-table">
          <thead>
            <tr>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Detail</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="logs-empty">
                  {totalCount > 0 ? 'No logs match this filter.' : 'No logs yet.'}
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <React.Fragment key={log.log_id}>
                  <tr className="logs-row" onClick={() => toggleExpand(log.log_id)}>
                    <td>{log.actor_name}</td>
                    <td>
                      <span className={actionBadgeClass(log.action)}>{formatActionLabel(log.action)}</span>
                    </td>
                    <td>{log.entity_type || '-'}</td>
                    <td className="logs-detail-cell" title={log.action_detail}>
                      {log.action_detail}
                    </td>
                    <td>{formatDate(log.created_at)}</td>
                    <td>
                      <img
                        src={chevronDown}
                        alt="Expand row"
                        className={`logs-chevron ${expandedLogId === log.log_id ? 'logs-chevron-open' : ''}`}
                      />
                    </td>
                  </tr>
                  {expandedLogId === log.log_id && (
                    <tr className="logs-detail-row">
                      <td colSpan={6}>
                        <div className="logs-detail-full">
                          <p><strong>Actor Type:</strong> {log.actor_type}</p>
                          {log.entity_type && (
                            <p><strong>Entity:</strong> {log.entity_type} #{log.entity_id}</p>
                          )}
                          <p><strong>Detail:</strong> {log.action_detail}</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
        </div>
      )}

      {!loading && !fetchError && totalPages > 1 && (
        <div className="logs-pagination">
          <button
            className="logs-page-btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Prev
          </button>
          {getPageNumbers(page, totalPages).map((p, idx) =>
            p === '...' ? (
              // => Ellipsis is a plain span, not a button, since it isn't
              //    clickable and shouldn't take keyboard focus
              <span key={`dots-${idx}`} className="logs-page-ellipsis">...</span>
            ) : (
              <button
                key={p}
                className={`logs-page-btn ${p === page ? 'logs-page-btn--active' : ''}`}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            )
          )}
          <button
            className="logs-page-btn"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next
          </button>
        </div>
      )}
    </main>
  );
}
