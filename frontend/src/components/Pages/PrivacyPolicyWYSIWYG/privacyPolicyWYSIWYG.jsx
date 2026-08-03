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
import LoadingState from '../../LoadingState/loadingState.jsx';
import './privacyPolicyWYSIWYG.css';

const PrivacyPolicyWYSIWYG = forwardRef(function PrivacyPolicyWYSIWYG(_props, ref) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  const fetchPrivacyPolicy = async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await axiosAdmin.get('/api/admin/pages/privacy-policy');
      setContent(res.data.page.content || '');
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

  const save = async () => {
    try {
      const res = await axiosAdmin.put('/api/admin/pages/privacy-policy', { content });
      setContent(res.data.page.content || '');
      toast.success('Privacy Policy saved.');
    } catch (err) {
      console.error('Failed to save privacy policy:', err);
      toast.error(err.response?.data?.error || 'Failed to save privacy policy.');
    }
  };

  // => Exposes save() to pages.jsx's header button via ref
  useImperativeHandle(ref, () => ({ save }));

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
    </div>
  );
});

export default PrivacyPolicyWYSIWYG;