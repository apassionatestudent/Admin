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
import ConfirmModal from '../../ConfirmModal/ConfirmModal.jsx';
import './termsAndConditionsWYSIWYG.css';

const TermsAndConditionsWYSIWYG = forwardRef(function TermsAndConditionsWYSIWYG({ onDirtyChange }, ref) {
  const [content, setContent] = useState('');
  // => Same dirty-tracking pattern as privacyPolicyWYSIWYG.jsx
  const [savedContent, setSavedContent] = useState('');
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
      setSavedContent(res.data.page.content || '');
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

  // => The actual PUT request - only runs after the admin confirms via
  //    ConfirmModal, same pattern as privacyPolicyWYSIWYG.jsx
  const performSave = async () => {
    try {
      const res = await axiosAdmin.put('/api/admin/pages/terms-and-conditions', { content });
      setContent(res.data.page.content || '');
      setSavedContent(res.data.page.content || ''); // => resets the dirty check baseline to the freshly-saved value
      toast.success('Terms and Conditions saved.');
      setRevisionsRefreshKey((prev) => prev + 1);
    } catch (err) {
      console.error('Failed to save terms and conditions:', err);
      toast.error(err.response?.data?.error || 'Failed to save terms and conditions.');
    }
  };

  const [confirmOpen, setConfirmOpen] = useState(false);

  // => save() now just opens the confirmation dialog - pages.jsx's header
  //    button calls this via ref, same wiring as before
  const save = () => {
    setConfirmOpen(true);
  };

  const handleConfirmSave = async () => {
    setConfirmOpen(false);
    await performSave();
  };

  // => Exposes save() to pages.jsx's header button via ref
  useImperativeHandle(ref, () => ({ save }));

  // => Reports dirty state up to pages.jsx, same pattern as
  //    privacyPolicyWYSIWYG.jsx
  useEffect(() => {
    onDirtyChange?.(content !== savedContent);
  }, [content, savedContent, onDirtyChange]);

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

      <ConfirmModal
        isOpen={confirmOpen}
        message="Save changes to the Terms and Conditions? This updates the live public page immediately."
        onConfirm={handleConfirmSave}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
});

export default TermsAndConditionsWYSIWYG;