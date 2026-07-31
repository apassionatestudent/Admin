import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import axiosAdmin from '../../../api/axiosAdmin.js';

// => Reuses the shared BackButton component instead of a one-off button,
import BackButton from '../../BackButton/BackButton.jsx';

import banIcon from '../../../assets/icons/ban.png';
import downloadIcon from '../../../assets/icons/download.png';

import './paymentDetail.css';

function PaymentDetail() {
  const { publicId } = useParams();
  const navigate = useNavigate();

  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);

  const [showVoidForm, setShowVoidForm] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const [downloading, setDownloading] = useState(false);

  const fetchPayment = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axiosAdmin.get(`/api/payments/${publicId}`);
      setPayment(response.data.payment);
    } catch (error) {
      console.error('Failed to load payment:', error);
      toast.error('Failed to load payment.');
    } finally {
      setLoading(false);
    }
  }, [publicId]);

  useEffect(() => {
    fetchPayment();
  }, [fetchPayment]);

  const handleVoid = async (e) => {
    e.preventDefault();

    if (!voidReason.trim() || voidReason.trim().length < 3) {
      toast.error('Enter a reason for voiding this payment.');
      return;
    }

    setVoiding(true);
    try {
      await axiosAdmin.patch(`/api/payments/${publicId}/void`, { voidReason });
      toast.success('Payment voided.');
      setShowVoidForm(false);
      fetchPayment();
    } catch (error) {
      console.error('Failed to void payment:', error);
      toast.error(error.response?.data?.message || 'Failed to void payment.');
    } finally {
      setVoiding(false);
    }
  };

  // => Backend PDF receipt endpoint still needs to be built. This assumes
  // => GET /api/payments/:publicId/receipt returns a PDF blob.
  const handleDownloadReceipt = async () => {
    setDownloading(true);
    try {
      const response = await axiosAdmin.get(`/api/payments/${publicId}/receipt`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Receipt-${payment.orNumber}.pdf`);
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

  const formatDate = (value) => {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatDateTime = (value) => {
    if (!value) return '-';
    return new Date(value).toLocaleString('en-PH');
  };

  if (loading) {
    return <div className="payment-detail-page">Loading payment...</div>;
  }

  if (!payment) {
    return <div className="payment-detail-page">Payment not found.</div>;
  }

  return (
    <div className="payment-detail-page">
      <BackButton destination="Payments" onClick={() => navigate('/dashboard/payments')} />

      <div className="payment-detail-header">
        <div>
          <h1>{payment.orNumber}</h1>
          <span className={`payment-detail-status-badge payment-detail-status-${payment.status.toLowerCase()}`}>
            {payment.status}
          </span>
        </div>

        <div className="payment-detail-header-actions">
          <button className="payment-detail-download-btn" onClick={handleDownloadReceipt} disabled={downloading}>
            <img src={downloadIcon} alt="" className="payment-detail-icon" />
            {downloading ? 'Preparing...' : 'Download Receipt'}
          </button>

          {payment.status === 'Completed' && (
            <button className="payment-detail-void-btn" onClick={() => setShowVoidForm(true)}>
              <img src={banIcon} alt="" className="payment-detail-icon" />
              Void Payment
            </button>
          )}
        </div>
      </div>

      <div className="payment-detail-top-row">
        <div className="payment-detail-card">
          <h2>Student</h2>
          <div className="payment-detail-grid">
            <div>
              <span className="payment-detail-label">Name</span>
              <span className="payment-detail-value">{payment.studentName}</span>
            </div>
            <div>
              <span className="payment-detail-label">Email</span>
              <span className="payment-detail-value">{payment.studentEmail}</span>
            </div>
          </div>
        </div>

        <div className="payment-detail-card">
          <h2>Enrollment</h2>
          <div className="payment-detail-grid">
            <div>
              <span className="payment-detail-label">Batch</span>
              <span className="payment-detail-value">{payment.batchName}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="payment-detail-card">
        <h2>Payment</h2>
        <div className="payment-detail-grid">
          <div>
            <span className="payment-detail-label">Amount</span>
            <span className="payment-detail-value">{formatCurrency(payment.amount)}</span>
          </div>
          <div>
            <span className="payment-detail-label">Payment Date</span>
            <span className="payment-detail-value">{formatDate(payment.paymentDate)}</span>
          </div>
          <div>
            <span className="payment-detail-label">Payment Method</span>
            <span className="payment-detail-value">{payment.paymentMethod}</span>
          </div>
          <div>
            <span className="payment-detail-label">Recorded By</span>
            <span className="payment-detail-value">{payment.createdByName}</span>
          </div>
          <div>
            <span className="payment-detail-label">Recorded At</span>
            <span className="payment-detail-value">{formatDateTime(payment.createdAt)}</span>
          </div>
        </div>

        {payment.remarks && (
          <div className="payment-detail-remarks">
            <span className="payment-detail-label">Remarks</span>
            <p>{payment.remarks}</p>
          </div>
        )}
      </div>

      {payment.status === 'Voided' && (
        <div className="payment-detail-card payment-detail-void-card">
          <h2>Void Details</h2>
          <div className="payment-detail-grid">
            <div>
              <span className="payment-detail-label">Reason</span>
              <span className="payment-detail-value">{payment.voidReason}</span>
            </div>
            <div>
              <span className="payment-detail-label">Voided By</span>
              <span className="payment-detail-value">{payment.voidedByName}</span>
            </div>
            <div>
              <span className="payment-detail-label">Voided At</span>
              <span className="payment-detail-value">{formatDateTime(payment.voidedAt)}</span>
            </div>
          </div>
        </div>
      )}

      {showVoidForm && (
        <div className="payment-detail-void-overlay" onClick={() => setShowVoidForm(false)}>
          <form className="payment-detail-void-form" onClick={(e) => e.stopPropagation()} onSubmit={handleVoid}>
            <h3>Void this payment</h3>
            <p>This cannot be undone. The record stays visible for audit purposes.</p>
            <textarea
              placeholder="Reason for voiding"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={3}
              required
            />
            <div className="payment-detail-void-actions">
              <button type="button" onClick={() => setShowVoidForm(false)}>Cancel</button>
              <button type="submit" disabled={voiding}>{voiding ? 'Voiding...' : 'Confirm Void'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default PaymentDetail;
