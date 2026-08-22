// => components/LogComponent/logComponent.jsx
// => Shared "dumb" log table + pagination component, modeled directly on
//    FacilitySessionCalendar's Activity Logs block (fsc-log-* classes).
//    That page's design is the template to replicate anywhere else a log
//    table is needed, NOT the Logs page. Each parent page still owns its
//    own fetch, its own section wrapper/title/count badge, and its own
//    pageSize - this component only renders the table + pagination and
//    reports page changes back up.

import React, { useState } from 'react';
import chevronDown from '../../assets/icons/chevron-down.png'; // => expand/collapse row icon
import './logComponent.css';

// => Builds a capped list of page buttons instead of one button per page,
//    ported from Logs.jsx's getPageNumbers so every table sharing this
//    component gets the same windowed pagination instead of a runaway
//    row of buttons on large result sets (e.g. page 15 of 27).
//    Always shows page 1 and the last page, plus a small window of
//    neighbors around the current page - gaps are filled with '...' so
//    the bar stays a fixed width no matter how many pages exist.
const getPageNumbers = (current, total) => {
  const delta = 1; // => how many neighbor pages to show on each side of current
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

/*
  Props:
  - logs           array of row objects, owned/fetched by the parent page
  - columns        array of { key, header, render(log), cellClassName? }
                    => lets each parent page define its own column set,
                       e.g. Date/Actor/Action/Details for the facility page
  - getRowId       (log) => unique key, defaults to log.log_id ?? log.id
  - loading        bool, shows a plain loading note, same as fsc's
                    "Loading activity logs…" text (no spinner component)
  - emptyMessage   string shown when logs.length === 0
  - page           current page number, owned by the parent
  - totalPages     total page count, owned by the parent
  - onPageChange   (nextPage) => void, parent updates its own page state
  - renderDetail   (log) => JSX, single block shown in the expanded row,
                    fsc renders this as one flowing paragraph
*/
export default function LogComponent({
  logs = [],
  columns = [],
  getRowId = (log) => log.log_id ?? log.id,
  loading = false,
  emptyMessage = 'No activity recorded yet.',
  page = 1,
  totalPages = 1,
  onPageChange,
  renderDetail,
}) {
  // => Which row is expanded, kept local since it is pure UI state with no
  //    data dependency - no parent page needs to read or reset this
  const [expandedId, setExpandedId] = useState(null);

  const colSpan = columns.length + 1; // => +1 for the chevron column

  if (loading) {
    return <p className="logc-empty-note">Loading activity logs…</p>;
  }

  if (logs.length === 0) {
    return <p className="logc-empty-note">{emptyMessage}</p>;
  }

  return (
    <>
      <div className="logc-log-table-wrap">
        <table className="logc-log-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key}>{col.header}</th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const rowId = getRowId(log);
              const isExpanded = expandedId === rowId;
              return (
                <React.Fragment key={rowId}>
                  <tr
                    className="logc-log-row"
                    onClick={() => setExpandedId(isExpanded ? null : rowId)}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={col.cellClassName || ''}>
                        {col.render(log)}
                      </td>
                    ))}
                    <td>
                      <img
                        src={chevronDown}
                        alt="Expand row"
                        className={`logc-log-chevron ${isExpanded ? 'logc-log-chevron-open' : ''}`}
                      />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="logc-log-detail-row">
                      <td colSpan={colSpan}>
                        <div className="logc-log-detail-full">
                          {renderDetail ? renderDetail(log) : null}
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

      {totalPages > 1 && (
        // => Windowed page-number pattern, same as Logs.jsx's own
        //    pagination bar, centered via the CSS below
        <div className="logc-log-pagination">
          <button
            className="logc-log-page-btn"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
          >
            Prev
          </button>
          {getPageNumbers(page, totalPages).map((p, idx) =>
            p === '...' ? (
              // => Ellipsis is a plain span, not a button, since it isn't
              //    clickable and shouldn't take keyboard focus
              <span key={`dots-${idx}`} className="logc-log-page-ellipsis">...</span>
            ) : (
              <button
                key={p}
                className={`logc-log-page-btn ${p === page ? 'logc-log-page-btn--active' : ''}`}
                onClick={() => onPageChange(p)}
              >
                {p}
              </button>
            )
          )}
          <button
            className="logc-log-page-btn"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
