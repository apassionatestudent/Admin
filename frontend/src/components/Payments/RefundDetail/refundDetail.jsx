// => admin/components/Payments/RefundDetail/refundDetail.jsx
// => Full detail view for a single refund. Void mirrors PaymentDetail's
//    void flow exactly - no hard delete, same audit reasoning.

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import axiosAdmin from '../../../utils/axiosAdmin.js';

import BackButton from '../../BackButton/BackButton.jsx';

import banIcon from '../../../assets/icons/ban.png';
import downloadIcon from '../../../assets/icons/download.png';

import './refundDetail.css';

function RefundDetail() {
  const { publicId } = useParams();
  const navigate = useNavigate();

  const [refund, setRefund] = useState(null);
  const [loading, setLoading] = useState(true);

  const [showVoidForm, setShowVoidForm] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const [downloading, setDownloading] = useState(false);

  const fetchRefund = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axiosAdmin.get(`/api/refunds/${publicId}`);
      setRefund(response.data.refund);
    } catch (error) {
      console.error('Failed to load refund:', error);
      toast.error('Failed to load refund.');
    } finally {
      setLoading(false);
    }
  }, [publicId]);

  useEffect(() => {
    fetchRefund();
  }, [fetchRefund]);

  const handleVoid = async (e) => {
    e.preventDefault();

    if (!voidReason.trim() || voidReason.trim().length < 3) {
      toast.error('Enter a reason for voiding this refund.');
      return;
    }

    setVoiding(true);
    try {
      await axiosAdmin.patch(`/api/refunds/${publicId}/void`, { voidReason });
      toast.success('Refund voided.');
      setShowVoidForm(false);
      fetchRefund();
    } catch (error) {
      console.error('Failed to void refund:', error);
      toast.error(error.response?.data?.message || 'Failed to void refund.');
    } finally {
      setVoiding(false);
    }
  };

  // => Mirrors PaymentDetail's handleDownloadReceipt, hits the refund
  // => receipt endpoint instead
  const handleDownloadReceipt = async () => {
    setDownloading(true);
    try {
      const response = await axiosAdmin.get(`/api/refunds/${publicId}/receipt`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Refund-Receipt-${refund.refundNumber}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download receipt:', error);
      toast.error('Failed to download receipt.');
    } finally {
      setDownloading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
  };

  const formatDateTime = (value) => {
    if (!value) return '-';
    return new Date(value).toLocaleString('en-PH');
  };

  const formatRefundBasis = () => {
    if (!refund) return '-';
    return refund.refundType === 'Percentage'
      ? `${refund.percentageValue}% of course fee`
      : 'Fixed amount';
  };

  if (loading) {
    return <div className="refund-detail-page">Loading refund...</div>;
  }

  if (!refund) {
    return <div className="refund-detail-page">Refund not found.</div>;
  }

  return (
    <div className="refund-detail-page">
      <BackButton destination="Payments" onClick={() => navigate('/dashboard/payments')} />

      <div className="refund-detail-header">
        <div>
          <h1>{refund.refundNumber}</h1>
          <span className={`refund-detail-status-badge refund-detail-status-${refund.status.toLowerCase()}`}>
            {refund.status}
          </span>
        </div>

        <div className="refund-detail-header-actions">
          <button className="refund-detail-download-btn" onClick={handleDownloadReceipt} disabled={downloading}>
            <img src={downloadIcon} alt="" className="refund-detail-icon" />
            {downloading ? 'Preparing...' : 'Download Receipt'}
          </button>

          {refund.status === 'Completed' && (
            <button className="refund-detail-void-btn" onClick={() => setShowVoidForm(true)}>
              <img src={banIcon} alt="" className="refund-detail-icon" />
              Void Refund
            </button>
          )}
        </div>
      </div>

      <div className="refund-detail-top-row">
        <div className="refund-detail-card">
          <h2>Student</h2>
          <div className="refund-detail-grid">
            <div>
              <span className="refund-detail-label">Name</span>
              <span className="refund-detail-value">{refund.studentName}</span>
            </div>
            <div>
              <span className="refund-detail-label">Email</span>
              <span className="refund-detail-value">{refund.studentEmail}</span>
            </div>
          </div>
        </div>

        <div className="refund-detail-card">
          <h2>Enrollment</h2>
          <div className="refund-detail-grid">
            <div>
              <span className="refund-detail-label">Batch</span>
              <span className="refund-detail-value">{refund.batchName}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="refund-detail-card">
        <h2>Refund</h2>
        <div className="refund-detail-grid">
          <div>
            <span className="refund-detail-label">Amount</span>
            <span className="refund-detail-value">{formatCurrency(refund.amount)}</span>
          </div>
          <div>
            <span className="refund-detail-label">Basis</span>
            <span className="refund-detail-value">{formatRefundBasis()}</span>
          </div>
          <div>
            <span className="refund-detail-label">Refund Method</span>
            <span className="refund-detail-value">{refund.refundMethod}</span>
          </div>
          <div>
            <span className="refund-detail-label">Recorded By</span>
            <span className="refund-detail-value">{refund.createdByName}</span>
          </div>
          <div>
            <span className="refund-detail-label">Recorded At</span>
            <span className="refund-detail-value">{formatDateTime(refund.createdAt)}</span>
          </div>
        </div>

        <div className="refund-detail-remarks">
          <span className="refund-detail-label">Reason</span>
          <p>{refund.reason}</p>
        </div>

        {refund.remarks && (
          <div className="refund-detail-remarks">
            <span className="refund-detail-label">Remarks</span>
            <p>{refund.remarks}</p>
          </div>
        )}
      </div>

      {refund.status === 'Voided' && (
        <div className="refund-detail-card refund-detail-void-card">
          <h2>Void Details</h2>
          <div className="refund-detail-grid">
            <div>
              <span className="refund-detail-label">Reason</span>
              <span className="refund-detail-value">{refund.voidReason}</span>
            </div>
            <div>
              <span className="refund-detail-label">Voided By</span>
              <span className="refund-detail-value">{refund.voidedByName}</span>
            </div>
            <div>
              <span className="refund-detail-label">Voided At</span>
              <span className="refund-detail-value">{formatDateTime(refund.voidedAt)}</span>
            </div>
          </div>
        </div>
      )}

      {showVoidForm && (
        <div className="refund-detail-void-overlay" onClick={() => setShowVoidForm(false)}>
          <form className="refund-detail-void-form" onClick={(e) => e.stopPropagation()} onSubmit={handleVoid}>
            <h3>Void this refund</h3>
            <p>This cannot be undone. The record stays visible for audit purposes.</p>
            <textarea
              placeholder="Reason for voiding"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={3}
              required
            />
            <div className="refund-detail-void-actions">
              <button type="button" onClick={() => setShowVoidForm(false)}>Cancel</button>
              <button type="submit" disabled={voiding}>{voiding ? 'Voiding...' : 'Confirm Void'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default RefundDetail;
