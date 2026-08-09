import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axiosAdmin from '../../../utils/axiosAdmin.js';
import BackButton from '../../BackButton/BackButton.jsx';
import LoadingState from '../../LoadingState/loadingState.jsx';
// => PLACEHOLDER - swap for the exact pencil icon FacilityDetail.jsx already
//    uses, per the reference-first convention. Flagging this import since
//    it's a new icon dependency until confirmed.
import pencilIcon from '../../../assets/icons/pencil.png';
// => Same clipboard/checkmark icons tesdaEnrollmentDetail.jsx's InfoCard
//    uses for its copy button, same relative depth from this file
import clipboardIcon from '../../../assets/icons/clipboard.png';
import checkMarkIcon from '../../../assets/icons/checkmark.png';
import './publicSupportTicketDetail.css';

const ALLOWED_STATUSES = ['Open', 'In Progress', 'Resolved', 'Unresolved'];

// => Formats ISO date string to a short date + time, own copy of
//    tesdaEnrollmentDetail.jsx's formatDateTime, per no-shared-code convention
const formatDateTime = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
};

// => CopyableField - label + value with a copy-to-clipboard icon, same
//    behavior as tesdaEnrollmentDetail.jsx's InfoCard copy button, but
//    kept as its own component under this file's own class prefix -
//    no shared component between the two pages, per project convention
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
    <div className="ticket-detail-row">
      <span className="ticket-detail-label">{label}</span>
      <div className="ticket-detail-value-row">
        <span className="ticket-detail-value">{value}</span>
        <button
          className={`ticket-detail-copy-btn ${copied ? 'ticket-detail-copy-btn--copied' : ''}`}
          onClick={handleCopy}
          title="Copy to clipboard"
        >
          {copied ? (
            <img src={checkMarkIcon} className="ticket-detail-copy-icon" alt="Copied" />
          ) : (
            <img src={clipboardIcon} className="ticket-detail-copy-icon" alt="Copy" />
          )}
        </button>
      </div>
    </div>
  );
}

export default function PublicSupportTicketDetail() {
  const { publicId } = useParams();
  const navigate = useNavigate();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  // => Read-only-first mode, same pattern as FacilityDetail.jsx - only
  //    Status and Internal Remarks ever become editable here, everything
  //    else on this ticket is permanently read-only since it's anonymous,
  //    publicly-submitted data
  const [isEditingHandling, setIsEditingHandling] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [remarksDraft, setRemarksDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // => Client-side pagination for the Activity Logs table, mirrors
  //    tesdaEnrollmentDetail.jsx's logPage state
  const [logPage, setLogPage] = useState(1);

  useEffect(() => {
    fetchTicket();
  }, [publicId]);

  const fetchTicket = async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await axiosAdmin.get(`/api/admin/public-support-tickets/${publicId}`);
      setTicket(res.data.data);
      setSelectedStatus(res.data.data.status);
      setRemarksDraft(res.data.data.internal_remarks || '');
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
    setIsEditingHandling(true);
  };

  const handleCancelEdit = () => {
    setSaveError('');
    setSelectedStatus(ticket.status);
    setRemarksDraft(ticket.internal_remarks || '');
    setIsEditingHandling(false);
  };

  const handleSaveHandling = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const res = await axiosAdmin.patch(`/api/admin/public-support-tickets/${publicId}`, {
        status: selectedStatus,
        internal_remarks: remarksDraft.trim() === '' ? null : remarksDraft,
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

  // => No backend log endpoint yet for support tickets - defaults to
  //    empty until ticket.logs is actually returned by the API
  const logs = ticket?.logs ?? [];

  const statusClass = (status) => `status-badge status-badge-${status.toLowerCase().replace(' ', '-')}`;

  return (
    <main className="ticket-detail-page">
      <BackButton destination="Support Tickets" onClick={() => navigate('/dashboard/support-tickets')} />

      {loading ? (
        <LoadingState message="Loading ticket…" />
      ) : fetchError || !ticket ? (
        <LoadingState variant="error" message={fetchError || 'Ticket not found.'} onRetry={fetchTicket} />
      ) : (
        <>
      <div className="ticket-detail-header">
        <h2>Support Ticket</h2>
        <p className="ticket-detail-subtitle">Submitted {new Date(ticket.created_at).toLocaleDateString('en-PH', {
          year: 'numeric', month: 'long', day: 'numeric',
        })}</p>
      </div>

      <div className="ticket-detail-card">
        <CopyableField label="Full Name" value={ticket.full_name} />
        <CopyableField label="Email" value={ticket.email} />

        <div className="ticket-detail-row">
          <span className="ticket-detail-label">Concern Type</span>
          <span className="ticket-detail-value">{ticket.concern_type}</span>
        </div>

        <div className="ticket-detail-row ticket-detail-row-full">
          <span className="ticket-detail-label">Concern</span>
          {/* => Plain JSX interpolation, never dangerouslySetInnerHTML on
                 public-submitted fields, per the XSS note in the brief */}
          <p className="ticket-detail-concern">{ticket.concern}</p>
        </div>

        <div className="ticket-detail-row ticket-detail-row-full">
          <span className="ticket-detail-label">Status</span>
          {isEditingHandling ? (
            <select
              className="ticket-detail-status-select"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              disabled={saving}
            >
              {ALLOWED_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          ) : (
            <div className="ticket-detail-edit-group">
              <span className={statusClass(ticket.status)}>{ticket.status}</span>
              <button className="ticket-detail-edit-btn" onClick={handleEditClick}>
                <img src={pencilIcon} alt="Edit status and remarks" className="ticket-detail-edit-icon" />
              </button>
            </div>
          )}
        </div>

        <div className="ticket-detail-row ticket-detail-row-full">
          <span className="ticket-detail-label">Internal Remarks</span>
          {isEditingHandling ? (
            <textarea
              className="ticket-detail-remarks-input"
              value={remarksDraft}
              onChange={(e) => setRemarksDraft(e.target.value)}
              placeholder="Notes on how this ticket was handled, e.g. called at 2pm, no answer..."
              rows={3}
              disabled={saving}
            />
          ) : (
            // => Admin-only note, never shown to the public ticket submitter -
            // => plain JSX interpolation only, same XSS guard as the concern field
            <p className="ticket-detail-remarks-text">
              {ticket.internal_remarks || 'No remarks yet.'}
            </p>
          )}
        </div>

        {isEditingHandling && (
          <div className="ticket-detail-row ticket-detail-row-full ticket-detail-edit-actions">
            <button className="btn-create-course" onClick={handleSaveHandling} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn-secondary" onClick={handleCancelEdit} disabled={saving}>
              Cancel
            </button>
          </div>
        )}

        {saveError && <p className="ticket-detail-save-error">{saveError}</p>}
      </div>

      {/* ════════════════════════════════════
          ACTIVITY LOGS
          => Same section pattern as tesdaEnrollmentDetail.jsx's Activity
             Logs section, own copy under this file's ticket-detail-*
             prefix per no-shared-code convention
          ════════════════════════════════════ */}
      <section className="ticket-detail-section">
        <h3 className="ticket-detail-section-title">
          Activity Logs
          <span className="ticket-detail-section-count-inline">{logs.length}</span>
        </h3>

        {logs.length === 0 ? (
          <p className="ticket-detail-empty-note">No activity recorded yet.</p>
        ) : (() => {
          // => IIFE so pagination math stays local to this section
          const LOGS_PER_PAGE = 10;
          const totalLogPages = Math.max(1, Math.ceil(logs.length / LOGS_PER_PAGE));
          const currentLogPage = Math.min(logPage, totalLogPages);
          const pagedLogs = logs.slice(
            (currentLogPage - 1) * LOGS_PER_PAGE,
            currentLogPage * LOGS_PER_PAGE
          );

          return (
            <>
              <div className="ticket-detail-sub-table-wrap">
                <table className="ticket-detail-sub-table">
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
                <div className="ticket-detail-log-pagination">
                  <button
                    className="ticket-detail-log-page-btn"
                    onClick={() => setLogPage(p => Math.max(1, p - 1))}
                    disabled={currentLogPage === 1}
                  >
                    Prev
                  </button>
                  {Array.from({ length: totalLogPages }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      className={`ticket-detail-log-page-btn ${p === currentLogPage ? 'ticket-detail-log-page-btn--active' : ''}`}
                      onClick={() => setLogPage(p)}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    className="ticket-detail-log-page-btn"
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