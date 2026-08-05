import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axiosAdmin from '../../../utils/axiosAdmin.js';
import BackButton from '../../BackButton/BackButton.jsx';
import LoadingState from '../../LoadingState/loadingState.jsx';
// => Same icons publicSupportTicketDetail.jsx already uses, same relative depth
import pencilIcon from '../../../assets/icons/pencil.png';
import clipboardIcon from '../../../assets/icons/clipboard.png';
import checkMarkIcon from '../../../assets/icons/checkmark.png';
import './studentSupportTicketDetail.css';

const ALLOWED_STATUSES = ['Open', 'In Progress', 'Resolved', 'Unresolved'];

// => Own copy of the date formatter, per no-shared-code convention
const formatDateTime = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
};

// => Own copy of CopyableField, same behavior as the public ticket detail
// => page's version but under this file's own class prefix
function CopyableField({ label, value }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(String(value)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="std-ticket-detail-row">
      <span className="std-ticket-detail-label">{label}</span>
      <div className="std-ticket-detail-value-row">
        <span className="std-ticket-detail-value">{value || '-'}</span>
        <button
          className={`std-ticket-detail-copy-btn ${copied ? 'std-ticket-detail-copy-btn--copied' : ''}`}
          onClick={handleCopy}
          title="Copy to clipboard"
        >
          {copied ? (
            <img src={checkMarkIcon} className="std-ticket-detail-copy-icon" alt="Copied" />
          ) : (
            <img src={clipboardIcon} className="std-ticket-detail-copy-icon" alt="Copy" />
          )}
        </button>
      </div>
    </div>
  );
}

export default function StudentSupportTicketDetail() {
  const { publicId } = useParams();
  const navigate = useNavigate();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  // => Status and Internal Remarks are editable together, same pattern as
  //    publicSupportTicketDetail.jsx - Subject/Message came from the
  //    student and stay permanently read-only
  const [isEditingHandling, setIsEditingHandling] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [remarksDraft, setRemarksDraft] = useState('');
  // => Student-facing remarks - what the student will eventually see on
  //    their own dashboard, e.g. "We tried calling you around 01AUG26 but
  //    you were unresponsive." Edited alongside status/internal remarks
  //    in the same Save action, but kept as its own textarea/draft.
  const [externalRemarksDraft, setExternalRemarksDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [logPage, setLogPage] = useState(1);

  useEffect(() => {
    fetchTicket();
  }, [publicId]);

  const fetchTicket = async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await axiosAdmin.get(`/api/admin/support-tickets/${publicId}`);
      setTicket(res.data.data);
      setSelectedStatus(res.data.data.status);
      setRemarksDraft(res.data.data.internal_remarks || '');
      setExternalRemarksDraft(res.data.data.external_remarks || '');
    } catch (error) {
      console.error('Failed to fetch support ticket:', error);
      setFetchError('Failed to load this support ticket. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = () => {
    setSaveError('');
    setSelectedStatus(ticket.status);
    setRemarksDraft(ticket.internal_remarks || '');
    setExternalRemarksDraft(ticket.external_remarks || '');
    setIsEditingHandling(true);
  };

  const handleCancelEdit = () => {
    setSaveError('');
    setSelectedStatus(ticket.status);
    setRemarksDraft(ticket.internal_remarks || '');
    setExternalRemarksDraft(ticket.external_remarks || '');
    setIsEditingHandling(false);
  };

  const handleSaveHandling = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const res = await axiosAdmin.patch(`/api/admin/support-tickets/${publicId}`, {
        status: selectedStatus,
        internal_remarks: remarksDraft.trim() === '' ? null : remarksDraft,
        external_remarks: externalRemarksDraft.trim() === '' ? null : externalRemarksDraft,
      });
      setTicket(res.data.data);
      setIsEditingHandling(false);
    } catch (error) {
      console.error('Failed to update ticket status/remarks:', error);
      setSaveError('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // => No log endpoint yet for support tickets - stays empty until wired up
  const logs = ticket?.logs ?? [];

  const statusClass = (status) => `status-badge status-badge-${status.toLowerCase().replace(' ', '-')}`;

  // => Builds the display name from student_profile columns, same order
  //    used elsewhere in the admin frontend (e.g. StudentDetail.jsx)
  // => name_extension can be the literal string "N/A" rather than null/empty,
  //    so it's excluded explicitly, not just filtered for truthiness
  const fullName = ticket
    ? [ticket.first_name, ticket.middle_name, ticket.last_name, ticket.name_extension]
        .filter((part) => part && part.trim().toUpperCase() !== 'N/A')
        .join(' ')
    : '';

  return (
    <main className="std-ticket-detail-page">
      <BackButton destination="Support Tickets" onClick={() => navigate('/dashboard/support-tickets')} />

      {loading ? (
        <LoadingState message="Loading ticket…" />
      ) : fetchError || !ticket ? (
        <LoadingState variant="error" message={fetchError || 'Ticket not found.'} onRetry={fetchTicket} />
      ) : (
        <>
      <div className="std-ticket-detail-header">
        <h2>Student Support Ticket</h2>
        <p className="std-ticket-detail-subtitle">Submitted {new Date(ticket.created_at).toLocaleDateString('en-PH', {
          year: 'numeric', month: 'long', day: 'numeric',
        })}</p>
      </div>

      <div className="std-ticket-detail-card">
        <CopyableField label="Full Name" value={fullName} />
        <CopyableField label="Contact Number" value={ticket.contact_no} />
        <CopyableField label="Email" value={ticket.email} />

        <div className="std-ticket-detail-row">
          <span className="std-ticket-detail-label">Concern Type</span>
          <span className="std-ticket-detail-value">{ticket.concern_type}</span>
        </div>

        <div className="std-ticket-detail-row">
          <span className="std-ticket-detail-label">Subject</span>
          <span className="std-ticket-detail-value">{ticket.subject}</span>
        </div>

        <div className="std-ticket-detail-row std-ticket-detail-row-full">
          <span className="std-ticket-detail-label">Message</span>
          {/* => Plain JSX interpolation only, never dangerouslySetInnerHTML on
                 student-submitted fields */}
          <p className="std-ticket-detail-message">{ticket.message}</p>
        </div>

        <div className="std-ticket-detail-row std-ticket-detail-row-full">
          <span className="std-ticket-detail-label">Status</span>
          {isEditingHandling ? (
            <select
              className="std-ticket-detail-status-select"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              disabled={saving}
            >
              {ALLOWED_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          ) : (
            <div className="std-ticket-detail-edit-group">
              <span className={statusClass(ticket.status)}>{ticket.status}</span>
              <button className="std-ticket-detail-edit-btn" onClick={handleEditClick}>
                <img src={pencilIcon} alt="Edit status and remarks" className="std-ticket-detail-edit-icon" />
              </button>
            </div>
          )}
        </div>

        <div className="std-ticket-detail-row std-ticket-detail-row-full">
          <span className="std-ticket-detail-label">Internal Remarks</span>
          {isEditingHandling ? (
            <textarea
              className="std-ticket-detail-remarks-input"
              value={remarksDraft}
              onChange={(e) => setRemarksDraft(e.target.value)}
              placeholder="Notes on how this ticket was handled, e.g. called at 2pm, no answer..."
              rows={3}
              disabled={saving}
            />
          ) : (
            // => Admin-only note, never shown to the student - plain JSX
            // => interpolation only, same XSS guard as the message field
            <p className="std-ticket-detail-remarks-text">
              {ticket.internal_remarks || 'No remarks yet.'}
            </p>
          )}
        </div>

        <div className="std-ticket-detail-row std-ticket-detail-row-full">
          <span className="std-ticket-detail-label">External Remarks (Visible to Student)</span>
          {isEditingHandling ? (
            <textarea
              className="std-ticket-detail-remarks-input"
              value={externalRemarksDraft}
              onChange={(e) => setExternalRemarksDraft(e.target.value)}
              placeholder="Note the student will see on their dashboard, e.g. We tried calling you around 01AUG26 but you were unresponsive..."
              rows={3}
              disabled={saving}
            />
          ) : (
            // => Shown here for admin reference only - the student-facing
            // => rendering happens on the student dashboard side, not built yet
            <p className="std-ticket-detail-remarks-text">
              {ticket.external_remarks || 'No remarks yet.'}
            </p>
          )}
        </div>

        {/* => Only shown once the ticket has actually been resolved -
               resolved_by/resolved_at are set automatically by the backend
               when status is changed to 'Resolved', never editable here */}
        {ticket.resolved_at && (
          <div className="std-ticket-detail-row std-ticket-detail-row-full">
            <span className="std-ticket-detail-label">Resolved By</span>
            <span className="std-ticket-detail-value">
              {ticket.resolved_by_name || 'Unknown Admin'} on {formatDateTime(ticket.resolved_at)}
            </span>
          </div>
        )}

        {isEditingHandling && (
          <div className="std-ticket-detail-row std-ticket-detail-row-full std-ticket-detail-edit-actions">
            <button className="btn-create-course" onClick={handleSaveHandling} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn-secondary" onClick={handleCancelEdit} disabled={saving}>
              Cancel
            </button>
          </div>
        )}

        {saveError && <p className="std-ticket-detail-save-error">{saveError}</p>}
      </div>

      {/* ════════════════════════════════════
          ACTIVITY LOGS
          => Placeholder until a logging endpoint exists for this table,
             same state as the public ticket detail page's section
          ════════════════════════════════════ */}
      <section className="std-ticket-detail-section">
        <h3 className="std-ticket-detail-section-title">
          Activity Logs
          <span className="std-ticket-detail-section-count-inline">{logs.length}</span>
        </h3>

        {logs.length === 0 ? (
          <p className="std-ticket-detail-empty-note">No activity recorded yet.</p>
        ) : (() => {
          const LOGS_PER_PAGE = 10;
          const totalLogPages = Math.max(1, Math.ceil(logs.length / LOGS_PER_PAGE));
          const currentLogPage = Math.min(logPage, totalLogPages);
          const pagedLogs = logs.slice(
            (currentLogPage - 1) * LOGS_PER_PAGE,
            currentLogPage * LOGS_PER_PAGE
          );

          return (
            <>
              <div className="std-ticket-detail-sub-table-wrap">
                <table className="std-ticket-detail-sub-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedLogs.map((log, i) => (
                      <tr key={log.log_id ?? i}>
                        <td>{formatDateTime(log.created_at)}</td>
                        <td>{log.performed_by_name ?? 'System'}</td>
                        <td>{log.action}</td>
                        <td>{log.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalLogPages > 1 && (
                <div className="std-ticket-detail-log-pagination">
                  <button
                    className="std-ticket-detail-log-page-btn"
                    onClick={() => setLogPage(p => Math.max(1, p - 1))}
                    disabled={currentLogPage === 1}
                  >
                    Prev
                  </button>
                  {Array.from({ length: totalLogPages }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      className={`std-ticket-detail-log-page-btn ${p === currentLogPage ? 'std-ticket-detail-log-page-btn--active' : ''}`}
                      onClick={() => setLogPage(p)}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    className="std-ticket-detail-log-page-btn"
                    onClick={() => setLogPage(p => Math.min(totalLogPages, p + 1))}
                    disabled={currentLogPage === totalLogPages}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          );
        })()}
      </section>
        </>
      )}
    </main>
  );
}
