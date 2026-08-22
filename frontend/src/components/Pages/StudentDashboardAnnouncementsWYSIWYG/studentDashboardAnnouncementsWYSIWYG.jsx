// => components/Pages/StudentDashboardAnnouncementsWYSIWYG/studentDashboardAnnouncementsWYSIWYG.jsx
// => List view for general Student Dashboard announcements - one row per
//    announcement (title/message/is_active), Add/Edit through
//    AddAnnouncementModal, Delete through the shared ConfirmModal.
// => General announcements only for now - course-specific announcements
//    would need a separate targeting model and are deferred.
// => Wired to /api/admin/pages/announcements - real backend, real Neon rows.

import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import toast from 'react-hot-toast';

import axiosAdmin from '../../../utils/axiosAdmin.js';
import AddAnnouncementModal from '../AddAnnouncementModal/addAnnouncementModal.jsx';
import ConfirmModal from '../../ConfirmModal/ConfirmModal.jsx';
import LoadingState from '../../LoadingState/loadingState.jsx';
import './studentDashboardAnnouncementsWYSIWYG.css';

// => PNG icons - project convention is actual image icons, not text/emoji or icon libraries
import pencilIcon from '../../../assets/icons/pencil.png';
import trashIcon from '../../../assets/icons/trash.png';

// => forwardRef so pages.jsx's shared header "+ Add Announcement" button
//    can call openAddModal() directly - the title/subtitle/button that
//    used to live in this component's own header now live in pages.jsx
// => viewMode ('active' | 'inactive') comes from pages.jsx's Active/Inactive
//    toggle next to the tab bar
const StudentDashboardAnnouncementsWYSIWYG = forwardRef(function StudentDashboardAnnouncementsWYSIWYG({ viewMode }, ref) {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null); // => null = Add mode
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null });

  const openAddModal = () => {
    setEditingAnnouncement(null);
    setModalOpen(true);
  };

  const openEditModal = (announcement) => {
    setEditingAnnouncement(announcement);
    setModalOpen(true);
  };

  // => Exposes openAddModal to pages.jsx's header button via ref
  useImperativeHandle(ref, () => ({ openAddModal }));

  const fetchAnnouncements = async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await axiosAdmin.get('/api/admin/pages/announcements');
      setAnnouncements(res.data.announcements);
    } catch (err) {
      console.error('Failed to fetch announcements:', err);
      setFetchError('Failed to load announcements. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleSaved = (savedAnnouncement) => {
    if (editingAnnouncement) {
      setAnnouncements((prev) =>
        prev.map((a) => (a.public_id === savedAnnouncement.public_id ? savedAnnouncement : a))
      );
      toast.success('Announcement updated.');
    } else {
      setAnnouncements((prev) => [savedAnnouncement, ...prev]);
      toast.success('Announcement added.');
    }
    setModalOpen(false);
  };

  const handleDelete = (announcement) => {
    setConfirmModal({
      isOpen: true,
      message: `Delete the announcement "${announcement.title}"? This cannot be undone.`,
      onConfirm: async () => {
        try {
          await axiosAdmin.delete(`/api/admin/pages/announcements/${announcement.public_id}`);
          setAnnouncements((prev) => prev.filter((a) => a.public_id !== announcement.public_id));
          toast.success('Announcement deleted.');
        } catch (err) {
          console.error('Failed to delete announcement:', err);
          toast.error(err.response?.data?.error || 'Failed to delete announcement.');
        }
      },
    });
  };

  const handleToggleActive = async (announcement) => {
    // => Optimistic flip first, so the badge feels instant - rolled back
    //    in the catch block if the request actually fails
    const nextIsActive = !announcement.is_active;
    setAnnouncements((prev) =>
      prev.map((a) => (a.public_id === announcement.public_id ? { ...a, is_active: nextIsActive } : a))
    );
    try {
      await axiosAdmin.patch(`/api/admin/pages/announcements/${announcement.public_id}/toggle-active`, {
        is_active: nextIsActive,
      });
    } catch (err) {
      console.error('Failed to toggle announcement status:', err);
      toast.error('Failed to update status. Reverting.');
      setAnnouncements((prev) =>
        prev.map((a) => (a.public_id === announcement.public_id ? { ...a, is_active: announcement.is_active } : a))
      );
    }
  };

  const closeConfirm = () => setConfirmModal({ isOpen: false, message: '', onConfirm: null });
  const handleConfirmYes = () => {
    const action = confirmModal.onConfirm;
    closeConfirm();
    if (action) action();
  };

  const stripHtml = (html) => (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  const formatDate = (isoStr) => {
    if (!isoStr) return '-';
    return new Date(isoStr).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // => Filtered by pages.jsx's Active/Inactive toggle - the raw
  //    `announcements` array stays untouched so we can still tell
  //    "genuinely no announcements" apart from "none match this filter"
  const visibleAnnouncements = announcements.filter((a) =>
    viewMode === 'inactive' ? !a.is_active : a.is_active
  );

  return (
    <div className="sdaw-wrap">

      {loading ? (
        <LoadingState message="Loading announcements…" />
      ) : fetchError ? (
        <LoadingState variant="error" message={fetchError} onRetry={fetchAnnouncements} />
      ) : visibleAnnouncements.length === 0 ? (
        <p className="sdaw-empty">
          {announcements.length === 0
            ? 'No announcements yet. Click "+ Add Announcement" above to create the first one.'
            : `No ${viewMode} announcements.`}
        </p>
      ) : (
        <div className="sdaw-table-wrap">
          <table className="sdaw-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Last Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleAnnouncements.map((a) => (
                <tr key={a.public_id}>
                  <td>
                    {/* => flex layout now lives on this inner div instead of the <td>
                           itself - display:flex directly on a table cell breaks its
                           table-cell box type in some browsers, which was pulling this
                           column out of the row's normal height/border-collapse
                           calculation and cutting the row divider under every other
                           column (Status, Last Updated, Actions) */}
                    <div className="sdaw-td-title">
                      <span className="sdaw-row-title">{a.title}</span>
                      <span className="sdaw-row-preview">{stripHtml(a.message)}</span>
                    </div>
                  </td>
                  <td>
                    <button
                      className={`sdaw-status-badge ${a.is_active ? 'sdaw-status-badge--active' : 'sdaw-status-badge--inactive'}`}
                      onClick={() => handleToggleActive(a)}
                      title="Click to toggle visibility"
                    >
                      {a.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="sdaw-td-date">{formatDate(a.updated_at)}</td>
                  <td>
                    <div className="sdaw-actions">
                      <button className="sdaw-edit-btn" onClick={() => openEditModal(a)} title="Edit" aria-label="Edit announcement">
                        <img src={pencilIcon} alt="Edit" />
                      </button>
                      <button className="sdaw-delete-btn" onClick={() => handleDelete(a)} title="Delete" aria-label="Delete announcement">
                        <img src={trashIcon} alt="Delete" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <AddAnnouncementModal
          announcement={editingAnnouncement}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        message={confirmModal.message}
        onConfirm={handleConfirmYes}
        onCancel={closeConfirm}
      />
    </div>
  );
});

export default StudentDashboardAnnouncementsWYSIWYG;