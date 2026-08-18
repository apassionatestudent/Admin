// => components/Pages/TermsAndConditionsWYSIWYG/termsAndConditionsWYSIWYG.jsx
// => Editor for the public-facing Terms and Conditions page content.
// => Full duplicate of privacyPolicyWYSIWYG.jsx (not a shared/generic
//    component) - forwardRef so pages.jsx's shared header "Save Changes"
//    button can call save() directly, same wiring as the Privacy Policy tab.
// => Wired to /api/admin/pages/terms-and-conditions - real backend, real Neon row.

import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import toast from 'react-hot-toast';

import axiosAdmin from '../../../utils/axiosAdmin.js';
import RichTextEditor from '../RichTextEditor/richTextEditor.jsx';
import LoadingState from '../../LoadingState/loadingState.jsx';
import TermsAndConditionsRevisions from '../TermsAndConditionsRevisions/termsAndConditionsRevisions.jsx';
import './termsAndConditionsWYSIWYG.css';

const TermsAndConditionsWYSIWYG = forwardRef(function TermsAndConditionsWYSIWYG(_props, ref) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  // => Bumped after a successful save so TermsAndConditionsRevisions
  //    refetches and shows the new version without a manual refresh
  const [revisionsRefreshKey, setRevisionsRefreshKey] = useState(0);

  const fetchTermsAndConditions = async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await axiosAdmin.get('/api/admin/pages/terms-and-conditions');
      setContent(res.data.page.content || '');
    } catch (err) {
      console.error('Failed to fetch terms and conditions:', err);
      setFetchError('Failed to load the terms and conditions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTermsAndConditions();
  }, []);

  const save = async () => {
    try {
      const res = await axiosAdmin.put('/api/admin/pages/terms-and-conditions', { content });
      setContent(res.data.page.content || '');
      toast.success('Terms and Conditions saved.');
      setRevisionsRefreshKey((prev) => prev + 1);
    } catch (err) {
      console.error('Failed to save terms and conditions:', err);
      toast.error(err.response?.data?.error || 'Failed to save terms and conditions.');
    }
  };

  // => Exposes save() to pages.jsx's header button via ref
  useImperativeHandle(ref, () => ({ save }));

  return (
    <div className="tcw-wrap">
      {loading ? (
        <LoadingState message="Loading terms and conditions…" />
      ) : fetchError ? (
        <LoadingState variant="error" message={fetchError} onRetry={fetchTermsAndConditions} />
      ) : (
        <RichTextEditor
          value={content}
          onChange={setContent}
          placeholder="Write the terms and conditions…"
        />
      )}

      <TermsAndConditionsRevisions refreshKey={revisionsRefreshKey} />
    </div>
  );
});

export default TermsAndConditionsWYSIWYG;