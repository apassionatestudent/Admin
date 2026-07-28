// => admin/components/Payments/AddRefund/addRefund.jsx
// => Search an enrollment with a refundable balance, then record a
//    Percentage (of course fee) or Fixed refund against it. Mirrors
//    AddPaymentModal's structure.

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

import axiosAdmin from '../../../api/axiosAdmin.js';

import closeIcon from '../../../assets/icons/close.png';
import searchIcon from '../../../assets/icons/magnifying-glass.png';
import pesoIcon from '../../../assets/icons/peso.png';

import './addRefund.css';

function AddRefund({ onClose, onCreated }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [selectedEnrollment, setSelectedEnrollment] = useState(null);

  const [refundType, setRefundType] = useState('Percentage'); // => 'Percentage' | 'Fixed'
  const [percentageValue, setPercentageValue] = useState('');
  const [fixedAmount, setFixedAmount] = useState('');
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await axiosAdmin.get('/api/refunds/refundable-enrollments', {
          params: { search }
        });
        setResults(response.data.enrollments);
      } catch (error) {
        console.error('Failed to search enrollments:', error);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => clearTimeout(timeoutId);
  }, [search]);

  const handleSelectEnrollment = (enrollment) => {
    setSelectedEnrollment(enrollment);
    setResults([]);
    setSearch('');
  };

  // => Percentage is calculated against the course's full fee, not
  // => against amount paid - see conversation notes on why
  const resolvedAmount = useCallback(() => {
    if (!selectedEnrollment) return 0;
    if (refundType === 'Percentage') {
      const pct = parseFloat(percentageValue);
      if (!pct) return 0;
      return selectedEnrollment.feeAtEnrollment * (pct / 100);
    }
    return parseFloat(fixedAmount) || 0;
  }, [selectedEnrollment, refundType, percentageValue, fixedAmount]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedEnrollment) {
      toast.error('Select a student enrollment first.');
      return;
    }

    const amount = resolvedAmount();

    if (!amount || amount <= 0) {
      toast.error('Enter a valid refund amount.');
      return;
    }

    if (amount > selectedEnrollment.refundableBalance) {
      toast.error(`Amount cannot exceed the refundable balance of PHP ${selectedEnrollment.refundableBalance.toFixed(2)}.`);
      return;
    }

    if (refundType === 'Percentage') {
      const pct = parseFloat(percentageValue);
      if (!pct || pct <= 0 || pct > 100) {
        toast.error('Enter a percentage between 1 and 100.');
        return;
      }
    }

    if (!reason.trim()) {
      toast.error('Reason is required.');
      return;
    }

    setSubmitting(true);
    try {
      await axiosAdmin.post('/api/refunds', {
        enrollmentId: selectedEnrollment.enrollmentId,
        refundType,
        percentageValue: refundType === 'Percentage' ? parseFloat(percentageValue) : undefined,
        amount,
        reason,
        remarks: remarks || null
      });

      onCreated();
    } catch (error) {
      console.error('Failed to record refund:', error);
      toast.error(error.response?.data?.message || 'Failed to record refund.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="add-refund-overlay" onClick={onClose}>
      <div className="add-refund-modal" onClick={(e) => e.stopPropagation()}>
        <div className="add-refund-header">
          <h2>Add Refund</h2>
          <button className="add-refund-close-btn" onClick={onClose}>
            <img src={closeIcon} alt="Close" className="add-refund-icon" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="add-refund-form">
          {!selectedEnrollment && (
            <div className="add-refund-field">
              <label>Search Student or Course</label>
              <div className="add-refund-search-box">
                <img src={searchIcon} alt="" className="add-refund-icon" />
                <input
                  type="text"
                  placeholder="Type a student name or course title"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
              </div>

              {searching && <p className="add-refund-hint">Searching...</p>}

              {results.length > 0 && (
                <ul className="add-refund-results">
                  {results.map((enrollment) => (
                    <li key={enrollment.enrollmentId} onClick={() => handleSelectEnrollment(enrollment)}>
                      <span className="add-refund-result-name">{enrollment.studentName}</span>
                      <span className="add-refund-result-course">{enrollment.courseTitle}</span>
                      <span className="add-refund-result-balance">
                        Refundable: PHP {enrollment.refundableBalance.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {!searching && search.trim() && results.length === 0 && (
                <p className="add-refund-hint">
                  No refundable enrollments found. Only Regular TESDA enrollments with at least one completed payment and a positive refundable balance appear here.
                </p>
              )}
            </div>
          )}

          {selectedEnrollment && (
            <>
              <div className="add-refund-selected-card">
                <div>
                  <strong>{selectedEnrollment.studentName}</strong>
                  <p>{selectedEnrollment.courseTitle} - {selectedEnrollment.batchName}</p>
                </div>
                <button
                  type="button"
                  className="add-refund-change-btn"
                  onClick={() => setSelectedEnrollment(null)}
                >
                  Change
                </button>
              </div>

              <div className="add-refund-balance-row">
                <span>Course Fee</span>
                <span>PHP {selectedEnrollment.feeAtEnrollment.toFixed(2)}</span>
              </div>
              <div className="add-refund-balance-row">
                <span>Total Paid</span>
                <span>PHP {selectedEnrollment.totalPaid.toFixed(2)}</span>
              </div>
              <div className="add-refund-balance-row">
                <span>Already Refunded</span>
                <span>PHP {selectedEnrollment.totalRefunded.toFixed(2)}</span>
              </div>
              <div className="add-refund-balance-row add-refund-balance-remaining">
                <span>Refundable Balance</span>
                <span>PHP {selectedEnrollment.refundableBalance.toFixed(2)}</span>
              </div>

              <div className="add-refund-field">
                <label>Refund Type <span className="add-refund-required">*</span></label>
                <div className="add-refund-type-toggle">
                  <button
                    type="button"
                    className={`add-refund-type-btn ${refundType === 'Percentage' ? 'add-refund-type-btn--active' : ''}`}
                    onClick={() => setRefundType('Percentage')}
                  >
                    Percentage
                  </button>
                  <button
                    type="button"
                    className={`add-refund-type-btn ${refundType === 'Fixed' ? 'add-refund-type-btn--active' : ''}`}
                    onClick={() => setRefundType('Fixed')}
                  >
                    Fixed Amount
                  </button>
                </div>
              </div>

              {refundType === 'Percentage' ? (
                <div className="add-refund-field">
                  <label>Percentage of Course Fee <span className="add-refund-required">*</span></label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="0.01"
                    value={percentageValue}
                    onChange={(e) => setPercentageValue(e.target.value)}
                    placeholder="e.g. 50"
                    required
                  />
                </div>
              ) : (
                <div className="add-refund-field">
                  <label>Amount <span className="add-refund-required">*</span></label>
                  <div className="add-refund-amount-box">
                    <img src={pesoIcon} alt="" className="add-refund-icon" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={selectedEnrollment.refundableBalance}
                      value={fixedAmount}
                      onChange={(e) => setFixedAmount(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              <div className="add-refund-preview-row">
                <span>Resolved Refund Amount</span>
                <span>PHP {resolvedAmount().toFixed(2)}</span>
              </div>

              <div className="add-refund-field">
                <label>Reason <span className="add-refund-required">*</span></label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why is this refund being issued?"
                  rows={3}
                  required
                />
              </div>

              <div className="add-refund-field">
                <label>Remarks <span className="add-refund-optional">(optional)</span></label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="add-refund-actions">
                <button type="button" className="add-refund-cancel-btn" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="add-refund-submit-btn" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Record Refund'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

export default AddRefund;
