// => components/Pages/TermsAndConditionsRevisions/termsAndConditionsRevisions.jsx
// => Full duplicate of PrivacyPolicyRevisions.jsx pointed at the Terms
//    and Conditions endpoint - not a shared component, per the same
//    "easier to locate at Oral Defense" reasoning as the backend split.

import React, { useEffect, useState } from 'react';
import axiosAdmin from '../../../utils/axiosAdmin.js';
import LoadingState from '../../LoadingState/loadingState.jsx';
import './termsAndConditionsRevisions.css';

// => Same icon files already needed for PrivacyPolicyRevisions.jsx -
//    reused here, no new imports to add if those are already in place
import historyIcon from '../../../assets/icons/history.png';
import chevronDownIcon from '../../../assets/icons/chevron-down.png';

const PAGE_SIZE = 5;

export default function TermsAndConditionsRevisions({ refreshKey }) {
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
      const res = await axiosAdmin.get('/api/admin/pages/terms-and-conditions/revisions', {
        params: { page: targetPage, pageSize: PAGE_SIZE },
      });
      setRevisions((prev) => (append ? [...prev, ...res.data.revisions] : res.data.revisions));
      setTotalPages(res.data.totalPages);
      setPage(targetPage);
    } catch (err) {
      console.error('Failed to fetch terms and conditions revisions:', err);
      setFetchError('Failed to load revision history.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // => refreshKey is bumped by termsAndConditionsWYSIWYG.jsx right after
  //    a successful save, so the new revision shows without a manual refresh
  useEffect(() => {
    fetchRevisions(1, false);
    setExpandedId(null);
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
    <div className="tcr-wrap">
      <div className="tcr-header">
        <img className="tcr-header-icon" src={historyIcon} alt="" />
        <h2 className="tcr-header-title">Previous Versions</h2>
      </div>

      {revisions.length === 0 ? (
        <p className="tcr-empty">No previous versions yet. Every future save will be recorded here.</p>
      ) : (
        <div className="tcr-list">
          {revisions.map((rev) => (
            <div key={rev.revision_id} className="tcr-item">
              <button type="button" className="tcr-item-header" onClick={() => toggleExpanded(rev.revision_id)}>
                <span className="tcr-item-meta">
                  Changed by <strong>{rev.changed_by_name}</strong> on {formatDate(rev.changed_at)}
                </span>
                <img
                  className={`tcr-chevron ${expandedId === rev.revision_id ? 'tcr-chevron--open' : ''}`}
                  src={chevronDownIcon}
                  alt=""
                />
              </button>

              {expandedId === rev.revision_id && (
                // => Content was already sanitized server-side at the time
                //    it was originally saved - safe to render as-is here
                <div className="tcr-item-content" dangerouslySetInnerHTML={{ __html: rev.content }} />
              )}
            </div>
          ))}
        </div>
      )}

      {page < totalPages && (
        <button type="button" className="tcr-load-more" onClick={() => fetchRevisions(page + 1, true)} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Load older versions'}
        </button>
      )}
    </div>
  );
}