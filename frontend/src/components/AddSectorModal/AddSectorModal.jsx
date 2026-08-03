import React, { useEffect, useState } from 'react';
import axiosAdmin from '../../utils/axiosAdmin.js';
import trashIcon from '../../assets/icons/trash.png'; 
import ConfirmModal from '../ConfirmModal/ConfirmModal.jsx';
import './AddSectorModal.css';

// => Add + list + soft-delete + restore for TESDA sectors, all in one modal.
// => Endpoint lives on the dedicated sectorCluster resource, not nested
// => under tesda-courses.
export default function AddSectorModal({ onClose, onCreated }) {
  const [viewMode, setViewMode] = useState('active'); // => 'active' | 'deleted'
  const [sectors, setSectors] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [sector, setSector] = useState('');
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
    fetchSectors();
  }, [viewMode]);

  const fetchSectors = async () => {
    setIsLoadingList(true);
    try {
      const path = viewMode === 'deleted' ? '/api/admin/sectors/deleted' : '/api/admin/sectors';
      const res = await axiosAdmin.get(path);
      setSectors(res.data.data);
    } catch (error) {
      console.error('Failed to load sectors:', error);
    } finally {
      setIsLoadingList(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setIsSaving(true);
    try {
      const res = await axiosAdmin.post('/api/admin/sectors', { sector });
      if (viewMode === 'active') {
        setSectors((prev) => [...prev, res.data.data].sort((a, b) => a.sector.localeCompare(b.sector)));
      }
      setSector('');
      onCreated();
    } catch (error) {
      console.error('Failed to create sector:', error);
      setErrorMsg(error.response?.data?.message || 'Failed to create sector.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (item) => {
    openConfirm(`Delete "${item.sector}"? Courses already using it keep showing it, but it won't be selectable for new ones.`, async () => {
      try {
        await axiosAdmin.delete(`/api/admin/sectors/${item.sector_id}`);
        setSectors((prev) => prev.filter((s) => s.sector_id !== item.sector_id));
      } catch (error) {
        console.error('Failed to delete sector:', error);
      }
    });
  };

  const handleRestore = (item) => {
    openConfirm(`Restore "${item.sector}"? It'll be selectable again for new courses.`, async () => {
      try {
        await axiosAdmin.post(`/api/admin/sectors/${item.sector_id}/restore`);
        setSectors((prev) => prev.filter((s) => s.sector_id !== item.sector_id));
      } catch (error) {
        console.error('Failed to restore sector:', error);
      }
    });
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="add-lookup-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Manage Sectors</h3>
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
                <input type="text" value={sector} onChange={(e) => setSector(e.target.value)} required />
              </label>

              {errorMsg && <p className="form-error">{errorMsg}</p>}

              <div className="modal-actions modal-actions-inline">
                <button type="submit" className="btn-primary" disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Add Sector'}
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
              <p className="lookup-list-status">Loading sectors...</p>
            ) : sectors.length === 0 ? (
              <p className="lookup-list-status">
                {viewMode === 'deleted' ? 'No deleted sectors.' : 'No sectors yet.'}
              </p>
            ) : (
              sectors.map((item) => (
                <div className="lookup-list-row" key={item.sector_id}>
                  <span>{item.sector}</span>
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
