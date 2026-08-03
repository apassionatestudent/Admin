import React, { useState, useEffect, useCallback } from 'react';
import closeIcon from '../../../assets/icons/close.png';
import searchIcon from '../../../assets/icons/magnifying-glass.png';
import pesoIcon from '../../../assets/icons/peso.png';
import toast from 'react-hot-toast';

import axiosAdmin from '../../../utils/axiosAdmin.js';

import './addPaymentModal.css';

function AddPaymentModal({ onClose, onCreated }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [selectedEnrollment, setSelectedEnrollment] = useState(null);
  const [amount, setAmount] = useState('');
  // => Payment date is always today - no longer user-editable, so no
  //    setter is exposed. Kept as state (not a plain const) so the
  //    existing submit payload doesn't need to change shape.
  const [paymentDate] = useState(() => new Date().toISOString().slice(0, 10));

  // => Formats the locked-in date for display without the timezone
  //    off-by-one risk of new Date('YYYY-MM-DD') - parse the parts
  //    manually instead.
  const formatDisplayDate = (isoDate) => {
    const [y, m, d] = isoDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-PH', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  };
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // => Debounced search against eligible enrollments as the admin types
  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await axiosAdmin.get('/api/payments/eligible-enrollments', {
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

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();

    if (!selectedEnrollment) {
      toast.error('Select a student enrollment first.');
      return;
    }

    const numericAmount = parseFloat(amount);

    if (!numericAmount || numericAmount <= 0) {
      toast.error('Enter a valid payment amount.');
      return;
    }

    if (numericAmount > selectedEnrollment.balance) {
      toast.error(`Amount cannot exceed the remaining balance of PHP ${selectedEnrollment.balance.toFixed(2)}.`);
      return;
    }

    setSubmitting(true);
    try {
      await axiosAdmin.post('/api/payments', {
        enrollmentType: selectedEnrollment.enrollmentType,
        enrollmentId: selectedEnrollment.enrollmentId,
        amount: numericAmount,
        paymentDate,
        remarks: remarks || null
      });

      onCreated();
    } catch (error) {
      console.error('Failed to record payment:', error);
      toast.error(error.response?.data?.message || 'Failed to record payment.');
    } finally {
      setSubmitting(false);
    }
  }, [selectedEnrollment, amount, paymentDate, remarks, onCreated]);

  return (
    <div className="add-payment-overlay" onClick={onClose}>
      <div className="add-payment-modal" onClick={(e) => e.stopPropagation()}>
        <div className="add-payment-header">
          <h2>Add Payment</h2>
          <button className="add-payment-close-btn" onClick={onClose}>
            <img src={closeIcon} alt="Close" className="add-payment-icon" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="add-payment-form">
          {!selectedEnrollment && (
            <div className="add-payment-field">
              <label>Search Student or Course</label>
              <div className="add-payment-search-box">
                <img src={searchIcon} alt="" className="add-payment-icon" />
                <input
                  type="text"
                  placeholder="Type a student name or course title"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
              </div>

              {searching && <p className="add-payment-hint">Searching...</p>}

              {results.length > 0 && (
                <ul className="add-payment-results">
                  {results.map((enrollment) => (
                    <li
                      key={`${enrollment.enrollmentType}-${enrollment.enrollmentId}`}
                      onClick={() => handleSelectEnrollment(enrollment)}
                    >
                      <span>
                        <span className={`add-payment-result-type-badge add-payment-result-type-badge--${enrollment.enrollmentType.toLowerCase()}`}>
                          {enrollment.enrollmentType}
                        </span>
                        <span className="add-payment-result-name">{enrollment.studentName}</span>
                      </span>
                      <span className="add-payment-result-course">{enrollment.courseTitle}</span>
                      <span className="add-payment-result-balance">
                        Balance: PHP {enrollment.balance.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {!searching && search.trim() && results.length === 0 && (
                <p className="add-payment-hint">
                  No eligible enrollments found. Only Regular, non-scholar TESDA enrollments with a remaining balance, or SHS enrollments whose batch has a miscellaneous fee assigned, appear here.
                </p>
              )}
            </div>
          )}

          {selectedEnrollment && (
            <>
              <div className="add-payment-selected-card">
                <div>
                  <strong>{selectedEnrollment.studentName}</strong>
                  <p>{selectedEnrollment.courseTitle} - {selectedEnrollment.batchName}</p>
                </div>
                <button
                  type="button"
                  className="add-payment-change-btn"
                  onClick={() => setSelectedEnrollment(null)}
                >
                  Change
                </button>
              </div>

              <div className="add-payment-balance-row">
                <span>{selectedEnrollment.enrollmentType === 'SHS' ? 'Total Miscellaneous Fee' : 'Total Fee'}</span>
                <span>PHP {selectedEnrollment.totalDue.toFixed(2)}</span>
              </div>
              <div className="add-payment-balance-row">
                <span>Already Paid</span>
                <span>PHP {selectedEnrollment.totalPaid.toFixed(2)}</span>
              </div>
              <div className="add-payment-balance-row add-payment-balance-remaining">
                <span>Remaining Balance</span>
                <span>PHP {selectedEnrollment.balance.toFixed(2)}</span>
              </div>

              <div className="add-payment-field">
                <label>Amount</label>
                <div className="add-payment-amount-box">
                  <img src={pesoIcon} alt="" className="add-payment-icon" />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={selectedEnrollment.balance}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="add-payment-field">
                <label>Payment Date</label>
                <p className="add-payment-static-date">{formatDisplayDate(paymentDate)}</p>
              </div>

              <div className="add-payment-field">
                <label>Remarks (optional)</label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="add-payment-actions">
                <button type="button" className="add-payment-cancel-btn" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="add-payment-submit-btn" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Record Payment'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

export default AddPaymentModal;
