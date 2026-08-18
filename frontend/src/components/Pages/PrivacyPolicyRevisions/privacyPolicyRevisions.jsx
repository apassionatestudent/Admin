// => components/Pages/PrivacyPolicyRevisions/privacyPolicyRevisions.jsx
// => Read-only list of previous Privacy Policy versions, rendered below
//    the live editor in privacyPolicyWYSIWYG.jsx. Each row expands
//    inline to show that version's full content - no modals, matches
//    the rest of the admin dashboard's inline-editing pattern.

import React, { useEffect, useState } from 'react';
import axiosAdmin from '../../../utils/axiosAdmin.js';
import LoadingState from '../../LoadingState/loadingState.jsx';
import './privacyPolicyRevisions.css';

// => Notify: these two icon files need to exist under assets/icons/ - a
//    clock/history icon and a small down-chevron, same size convention
//    as bold.png/italic.png etc. in richTextEditor.jsx
import historyIcon from '../../../assets/icons/history.png';
import chevronDownIcon from '../../../assets/icons/chevron-down.png';

const PAGE_SIZE = 5;

// => refreshKey is bumped by the parent (privacyPolicyWYSIWYG.jsx) right
//    after a successful save - changing it re-runs the effect below and
//    pulls the freshly-created revision in, no manual page refresh needed
export default function PrivacyPolicyRevisions({ refreshKey }) {
  const [revisions, setRevisions] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [expandedId, setExpandedId] = useState(null); // => revision_id currently expanded, or null

  const fetchRevisions = async (targetPage, append) => {
    append ? setLoadingMore(true) : setLoading(true);
    setFetchError('');
    try {
      const res = await axiosAdmin.get('/api/admin/pages/privacy-policy/revisions', {
        params: { page: targetPage, pageSize: PAGE_SIZE },
      });
      setRevisions((prev) => (append ? [...prev, ...res.data.revisions] : res.data.revisions));
      setTotalPages(res.data.totalPages);
      setPage(targetPage);
    } catch (err) {
      console.error('Failed to fetch privacy policy revisions:', err);
      setFetchError('Failed to load revision history.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchRevisions(1, false);
    setExpandedId(null); // => collapse any open row, since the list underneath it just changed
  }, [refreshKey]);

  const toggleExpanded = (revisionId) => {
    setExpandedId((prev) => (prev === revisionId ? null : revisionId));
  };

  const formatDate = (isoString) =>
    new Date(isoString).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });

  if (loading) return <LoadingState message="Loading revision history…" />;
  if (fetchError) {
    return <LoadingState variant="error" message={fetchError} onRetry={() => fetchRevisions(1, false)} />;
  }

  return (
    <div className="ppr-wrap">
      <div className="ppr-header">
        <img className="ppr-header-icon" src={historyIcon} alt="" />
        <h2 className="ppr-header-title">Previous Versions</h2>
      </div>

      {revisions.length === 0 ? (
        <p className="ppr-empty">No previous versions yet. Every future save will be recorded here.</p>
      ) : (
        <div className="ppr-list">
          {revisions.map((rev) => (
            <div key={rev.revision_id} className="ppr-item">
              <button type="button" className="ppr-item-header" onClick={() => toggleExpanded(rev.revision_id)}>
                <span className="ppr-item-meta">
                  Changed by <strong>{rev.changed_by_name}</strong> on {formatDate(rev.changed_at)}
                </span>
                <img
                  className={`ppr-chevron ${expandedId === rev.revision_id ? 'ppr-chevron--open' : ''}`}
                  src={chevronDownIcon}
                  alt=""
                />
              </button>

              {expandedId === rev.revision_id && (
                // => Content was already sanitized server-side at the time
                //    it was originally saved - safe to render as-is here
                <div className="ppr-item-content" dangerouslySetInnerHTML={{ __html: rev.content }} />
              )}
            </div>
          ))}
        </div>
      )}

      {page < totalPages && (
        <button type="button" className="ppr-load-more" onClick={() => fetchRevisions(page + 1, true)} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Load older versions'}
        </button>
      )}
    </div>
  );
}