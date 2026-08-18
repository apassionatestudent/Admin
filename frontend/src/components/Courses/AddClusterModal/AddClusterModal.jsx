import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import axiosAdmin from '../../../utils/axiosAdmin.js';
import trashIcon from '../../../assets/icons/trash.png'; 
import ConfirmModal from '../../ConfirmModal/ConfirmModal.jsx';
import './AddClusterModal.css';

// => Add + list + soft-delete + restore for SHS clusters, all in one modal -
// => mirrors AddSectorModal.jsx exactly. Backend derives the
// => machine-readable 'value' column from the name automatically (slugify),
// => so only the display name is collected here.
export default function AddClusterModal({ onClose, onCreated }) {
  const [viewMode, setViewMode] = useState('active'); // => 'active' | 'deleted'
  const [clusters, setClusters] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null });
  const openConfirm = (message, onConfirm) => setConfirmModal({ isOpen: true, message, onConfirm });
  const closeConfirm = () => setConfirmModal({ isOpen: false, message: '', onConfirm: null });
  const handleConfirmYes = () => {
    const action = confirmModal.onConfirm;
    closeConfirm();
    if (action) action();
  };

  useEffect(() => {
    fetchClusters();
  }, [viewMode]);

  const fetchClusters = async () => {
    setIsLoadingList(true);
    try {
      const path = viewMode === 'deleted' ? '/api/admin/clusters/deleted' : '/api/admin/clusters';
      const res = await axiosAdmin.get(path);
      setClusters(res.data.data);
    } catch (error) {
      console.error('Failed to load clusters:', error);
    } finally {
      setIsLoadingList(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setIsSaving(true);
    try {
      const res = await axiosAdmin.post('/api/admin/clusters', { name });
      if (viewMode === 'active') {
        setClusters((prev) => [...prev, res.data.data].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setName('');
      onCreated();
    } catch (error) {
      console.error('Failed to create cluster:', error);
      setErrorMsg(error.response?.data?.message || 'Failed to create cluster.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (item) => {
    // => Reworded: deleting a cluster now cascades to deactivate any course
    // => still referencing it, so the confirm message needs to warn about
    // => that instead of promising courses keep showing unaffected
    openConfirm(`Delete "${item.name}"? Any active course still using it will be marked inactive.`, async () => {
      try {
        const res = await axiosAdmin.delete(`/api/admin/clusters/${item.cluster_id}`);
        setClusters((prev) => prev.filter((c) => c.cluster_id !== item.cluster_id));
        toast.success(res.data.message || 'Cluster deleted');
        // => Delete can now cascade-deactivate courses behind this modal, so
        // => the parent Courses list needs to refetch immediately rather
        // => than showing stale "Active" badges until a manual page reload
        onCreated();
      } catch (error) {
        console.error('Failed to delete cluster:', error);
        toast.error(error.response?.data?.message || 'Failed to delete cluster.');
      }
    });
  };

  const handleRestore = (item) => {
    openConfirm(`Restore "${item.name}"? It'll be selectable again for new courses.`, async () => {
      try {
        await axiosAdmin.post(`/api/admin/clusters/${item.cluster_id}/restore`);
        setClusters((prev) => prev.filter((c) => c.cluster_id !== item.cluster_id));
      } catch (error) {
        console.error('Failed to restore cluster:', error);
      }
    });
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="add-lookup-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Manage Clusters</h3>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>

          {viewMode === 'active' && (
            <form onSubmit={handleSubmit}>
              <p className="form-reminder">
                Please double-check the spelling before saving - this will appear across your course
                listings once used.
              </p>

              <label>
                Name *
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
              </label>

              {errorMsg && <p className="form-error">{errorMsg}</p>}

              <div className="modal-actions modal-actions-inline">
                <button type="submit" className="btn-primary" disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Add Cluster'}
                </button>
              </div>
            </form>
          )}

          <div className="lookup-view-toggle">
            <button
              className={viewMode === 'active' ? 'lookup-toggle-btn lookup-toggle-active' : 'lookup-toggle-btn'}
              onClick={() => setViewMode('active')}
            >
              Active
            </button>
            <button
              className={viewMode === 'deleted' ? 'lookup-toggle-btn lookup-toggle-active' : 'lookup-toggle-btn'}
              onClick={() => setViewMode('deleted')}
            >
              Deleted
            </button>
          </div>

          <div className="lookup-list">
            {isLoadingList ? (
              <p className="lookup-list-status">Loading clusters...</p>
            ) : clusters.length === 0 ? (
              <p className="lookup-list-status">
                {viewMode === 'deleted' ? 'No deleted clusters.' : 'No clusters yet.'}
              </p>
            ) : (
              clusters.map((item) => (
                <div className="lookup-list-row" key={item.cluster_id}>
                  <span>{item.name}</span>
                  {viewMode === 'deleted' ? (
                    <button className="btn-restore" onClick={() => handleRestore(item)}>
                      Restore
                    </button>
                  ) : (
                    <button className="icon-btn" onClick={() => handleDelete(item)} title="Delete">
                      <img src={trashIcon} alt="Delete" className="trash-icon" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        message={confirmModal.message}
        onConfirm={handleConfirmYes}
        onCancel={closeConfirm}
      />
    </>
  );
}
