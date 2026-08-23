// => components/Pages/PrivacyPolicyWYSIWYG/privacyPolicyWYSIWYG.jsx
// => Editor for the public-facing Privacy Policy page content.
// => forwardRef so pages.jsx's shared header "Save Changes" button can
//    call save() directly - the title/subtitle/button that used to live
//    in this component's own header now live in pages.jsx.
// => Wired to /api/admin/pages/privacy-policy - real backend, real Neon row.

import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import toast from 'react-hot-toast';

import axiosAdmin from '../../../utils/axiosAdmin.js';
import RichTextEditor from '../RichTextEditor/richTextEditor.jsx';
import PrivacyPolicyRevisions from '../PrivacyPolicyRevisions/privacyPolicyRevisions.jsx';
import LoadingState from '../../LoadingState/loadingState.jsx';
import ConfirmModal from '../../ConfirmModal/ConfirmModal.jsx';
import './privacyPolicyWYSIWYG.css';

const PrivacyPolicyWYSIWYG = forwardRef(function PrivacyPolicyWYSIWYG({ onDirtyChange }, ref) {
  const [content, setContent] = useState('');
  // => Tracks the last-saved/last-fetched value separately from the live
  //    editor content, so we can tell "actually edited" apart from "just
  //    viewing" - used to disable the Save Changes button when nothing changed
  const [savedContent, setSavedContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  // => Passed down to PrivacyPolicyRevisions as a prop - incrementing it
  //    forces that component's effect to re-run and refetch, since props
  //    changing (not just state) is what a child component can react to
  const [revisionsRefreshKey, setRevisionsRefreshKey] = useState(0);

  const fetchPrivacyPolicy = async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await axiosAdmin.get('/api/admin/pages/privacy-policy');
      setContent(res.data.page.content || '');
      setSavedContent(res.data.page.content || '');
    } catch (err) {
      console.error('Failed to fetch privacy policy:', err);
      setFetchError('Failed to load the privacy policy. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrivacyPolicy();
  }, []);

  // => The actual PUT request - only runs after the admin confirms via
  //    ConfirmModal, so a stray click on "Save Changes" can't overwrite
  //    the live public-facing Privacy Policy without a second step
  const performSave = async () => {
    try {
      const res = await axiosAdmin.put('/api/admin/pages/privacy-policy', { content });
      setContent(res.data.page.content || '');
      setSavedContent(res.data.page.content || ''); // => resets the dirty check baseline to the freshly-saved value
      toast.success('Privacy Policy saved.');
      setRevisionsRefreshKey((prev) => prev + 1); // => tells PrivacyPolicyRevisions a new revision was just written
    } catch (err) {
      console.error('Failed to save privacy policy:', err);
      toast.error(err.response?.data?.error || 'Failed to save privacy policy.');
    }
  };

  const [confirmOpen, setConfirmOpen] = useState(false);

  // => save() now just opens the confirmation dialog - pages.jsx's header
  //    button calls this via ref, same wiring as before, only the inside
  //    of the function changed
  const save = () => {
    setConfirmOpen(true);
  };

  const handleConfirmSave = async () => {
    setConfirmOpen(false);
    await performSave();
  };

  // => Exposes save() to pages.jsx's header button via ref
  useImperativeHandle(ref, () => ({ save }));

  // => Reports dirty state up to pages.jsx every time content or the
  //    saved baseline changes, so the header's Save Changes button can
  //    disable itself when there's nothing to save
  useEffect(() => {
    onDirtyChange?.(content !== savedContent);
  }, [content, savedContent, onDirtyChange]);

  return (
    <div className="ppw-wrap">
      {loading ? (
        <LoadingState message="Loading privacy policy…" />
      ) : fetchError ? (
        <LoadingState variant="error" message={fetchError} onRetry={fetchPrivacyPolicy} />
      ) : (
        <RichTextEditor
          value={content}
          onChange={setContent}
          placeholder="Write the privacy policy…"
        />
      )}

      {/* => Renders independently of the editor's own loading state, so
             revision history stays visible even if the live content
             fetch above fails or is still loading */}
      <PrivacyPolicyRevisions refreshKey={revisionsRefreshKey} />

      <ConfirmModal
        isOpen={confirmOpen}
        message="Save changes to the Privacy Policy? This updates the live public page immediately."
        onConfirm={handleConfirmSave}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
});

export default PrivacyPolicyWYSIWYG;