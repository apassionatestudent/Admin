// => admin/pages/Payments/payments.jsx
// => Two tabs on one page: Payments (OTC payment records) and Refunds
//    (partial/full refunds). Each tab owns its own list/filter/pagination
//    state and fetches independently, only while it's the active tab.
//    Visual language matches Classes.jsx (adm-* class names) - duplicated
//    into payments.css rather than shared, per project convention.

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import toast from 'react-hot-toast';

import axiosAdmin from '../../utils/axiosAdmin.js';

import emptyPaymentsIcon from '../../assets/icons/empty-classes.png';

import AddPaymentModal from '../../components/Payments/AddPaymentModal/addPaymentModal.jsx';
import AddRefund from '../../components/Payments/AddRefund/addRefund.jsx';
// => Shared spinner/error block, replaces the local adm-payments-state markup below
import LoadingState from '../../components/LoadingState/loadingState.jsx';

import './payments.css';

const PAGE_SIZE = 10;

const PAYMENT_STATUS_FILTERS = ['ALL', 'Completed', 'Voided'];
const REFUND_STATUS_FILTERS = ['ALL', 'Completed', 'Voided'];

const MAIN_TABS = [
  { key: 'payments', label: 'Payments' },
  { key: 'refunds',  label: 'Refunds' },
];

const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
};

const formatDate = (value) => {
  if (!value) return '-';
  const datePart = String(value).slice(0, 10);
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
};

function Payments() {
  const navigate = useNavigate();
  const { admin } = useOutletContext();

  // => Belt-and-suspenders redirect - the backend already returns 403 on
  // => every axiosAdmin call below via requireSection('payments'), but
  // => without this the page still renders its full shell and only shows
  // => fetch errors instead of bouncing back to Dashboard
  useEffect(() => {
    if (admin && admin.role !== 'super_admin' && !admin.sections?.includes('payments')) {
      navigate('/dashboard');
    }
  }, [admin, navigate]);

  // => Which of the two top-level tabs is showing
  const [mainTab, setMainTab] = useState('payments'); // => 'payments' | 'refunds'

  // ════════════════════════════════════
  // PAYMENTS TAB STATE
  // ════════════════════════════════════
  const [payments, setPayments] = useState([]);
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentTotalPages, setPaymentTotalPages] = useState(1);
  const [paymentTotalCount, setPaymentTotalCount] = useState(0);
  const [paymentLoading, setPaymentLoading] = useState(true);
  const [paymentError, setPaymentError] = useState(null);
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('ALL');
  const [paymentCourseFilter, setPaymentCourseFilter] = useState('ALL');
  const [paymentCourseOptions, setPaymentCourseOptions] = useState([]);
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);

  // ════════════════════════════════════
  // REFUNDS TAB STATE
  // ════════════════════════════════════
  const [refunds, setRefunds] = useState([]);
  const [refundPage, setRefundPage] = useState(1);
  const [refundTotalPages, setRefundTotalPages] = useState(1);
  const [refundTotalCount, setRefundTotalCount] = useState(0);
  const [refundLoading, setRefundLoading] = useState(true);
  const [refundError, setRefundError] = useState(null);
  const [refundSearch, setRefundSearch] = useState('');
  const [refundStatusFilter, setRefundStatusFilter] = useState('ALL');
  const [refundCourseFilter, setRefundCourseFilter] = useState('ALL');
  const [refundCourseOptions, setRefundCourseOptions] = useState([]);
  const [showAddRefundModal, setShowAddRefundModal] = useState(false);

  // => Course dropdown options load once per tab - active TESDA courses
  // => don't change often enough to need refetching alongside each list
  useEffect(() => {
    const fetchPaymentCourseOptions = async () => {
      try {
        const response = await axiosAdmin.get('/api/payments/course-options');
        setPaymentCourseOptions(response.data.courses);
      } catch (err) {
        console.error('Failed to load course options:', err);
      }
    };
    fetchPaymentCourseOptions();
  }, []);

  useEffect(() => {
    const fetchRefundCourseOptions = async () => {
      try {
        const response = await axiosAdmin.get('/api/refunds/course-options');
        setRefundCourseOptions(response.data.courses);
      } catch (err) {
        console.error('Failed to load course options:', err);
      }
    };
    fetchRefundCourseOptions();
  }, []);

  // ════════════════════════════════════
  // PAYMENTS: fetch + handlers
  // ════════════════════════════════════
  const fetchPayments = useCallback(async () => {
    setPaymentLoading(true);
    setPaymentError(null);
    try {
      const response = await axiosAdmin.get('/api/payments', {
        params: {
          page: paymentPage,
          limit: PAGE_SIZE,
          status: paymentStatusFilter === 'ALL' ? undefined : paymentStatusFilter,
          courseId: paymentCourseFilter === 'ALL' ? undefined : paymentCourseFilter,
          search: paymentSearch || undefined
        }
      });

      setPayments(response.data.payments);
      setPaymentTotalPages(response.data.totalPages);
      setPaymentTotalCount(response.data.totalCount);
    } catch (err) {
      console.error('Failed to load payments:', err);
      setPaymentError('Failed to load payments. Please try again.');
    } finally {
      setPaymentLoading(false);
    }
  }, [paymentPage, paymentStatusFilter, paymentCourseFilter, paymentSearch]);

  // => Only fetches while the Payments tab is actually showing
  useEffect(() => {
    if (mainTab !== 'payments') return;
    const timeoutId = setTimeout(() => {
      fetchPayments();
    }, 350);
    return () => clearTimeout(timeoutId);
  }, [mainTab, fetchPayments]);

  const handlePaymentSearchChange = (value) => {
    setPaymentSearch(value);
    setPaymentPage(1);
  };

  const handlePaymentStatusChange = (value) => {
    setPaymentStatusFilter(value);
    setPaymentPage(1);
  };

  const handlePaymentCourseChange = (value) => {
    setPaymentCourseFilter(value);
    setPaymentPage(1);
  };

  const handlePaymentCreated = () => {
    setShowAddPaymentModal(false);
    toast.success('Payment recorded successfully.');
    setPaymentPage(1);
    fetchPayments();
  };

  // ════════════════════════════════════
  // REFUNDS: fetch + handlers
  // ════════════════════════════════════
  const fetchRefunds = useCallback(async () => {
    setRefundLoading(true);
    setRefundError(null);
    try {
      const response = await axiosAdmin.get('/api/refunds', {
        params: {
          page: refundPage,
          limit: PAGE_SIZE,
          status: refundStatusFilter === 'ALL' ? undefined : refundStatusFilter,
          courseId: refundCourseFilter === 'ALL' ? undefined : refundCourseFilter,
          search: refundSearch || undefined
        }
      });

      setRefunds(response.data.refunds);
      setRefundTotalPages(response.data.totalPages);
      setRefundTotalCount(response.data.totalCount);
    } catch (err) {
      console.error('Failed to load refunds:', err);
      setRefundError('Failed to load refunds. Please try again.');
    } finally {
      setRefundLoading(false);
    }
  }, [refundPage, refundStatusFilter, refundCourseFilter, refundSearch]);

  useEffect(() => {
    if (mainTab !== 'refunds') return;
    const timeoutId = setTimeout(() => {
      fetchRefunds();
    }, 350);
    return () => clearTimeout(timeoutId);
  }, [mainTab, fetchRefunds]);

  const handleRefundSearchChange = (value) => {
    setRefundSearch(value);
    setRefundPage(1);
  };

  const handleRefundStatusChange = (value) => {
    setRefundStatusFilter(value);
    setRefundPage(1);
  };

  const handleRefundCourseChange = (value) => {
    setRefundCourseFilter(value);
    setRefundPage(1);
  };

  const handleRefundCreated = () => {
    setShowAddRefundModal(false);
    toast.success('Refund recorded successfully.');
    setRefundPage(1);
    fetchRefunds();
  };

  // => Header subtitle swaps per tab, same pattern as Classes.jsx's headerSubtitle
  // => No longer TESDA-only copy - the list now correctly includes SHS
  //    payments/refunds too, now that the underlying queries join both
  //    enrollment types instead of always assuming TESDA
  const headerSubtitle =
    mainTab === 'payments'
      ? <>Showing <strong>{paymentTotalCount}</strong> payment{paymentTotalCount === 1 ? '' : 's'}.</>
      : <>Showing <strong>{refundTotalCount}</strong> refund{refundTotalCount === 1 ? '' : 's'}.</>;

  return (
    <div className="adm-payments-page">

      {/* ════════════════════════════════════
          PAGE HEADER
          ════════════════════════════════════ */}
      <div className="adm-payments-header">
        <div>
          {/* => Title now swaps per tab too, same mainTab check as headerSubtitle */}
          <h1 className="adm-payments-title">{mainTab === 'payments' ? 'Payments' : 'Refunds'}</h1>
          <p className="adm-payments-subtitle">{headerSubtitle}</p>
        </div>
      </div>

      {/* ════════════════════════════════════
          MAIN TABS (Payments | Refunds)
          ════════════════════════════════════ */}
      <div className="adm-main-tabs-row">
        <div className="adm-main-tabs">
          {MAIN_TABS.map((tab) => (
            <button
              key={tab.key}
              className={`adm-main-tab-btn ${mainTab === tab.key ? 'adm-main-tab-btn--active' : ''}`}
              onClick={() => setMainTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════
          PAYMENTS TAB
          ════════════════════════════════════ */}
      {mainTab === 'payments' && (
        <>
          <div className="adm-search-wrap">
            <div className="adm-search-row">
              <input
                type="text"
                className="adm-search-input"
                placeholder="Search by Official Receipt (OR) number or student name…"
                value={paymentSearch}
                onChange={(e) => handlePaymentSearchChange(e.target.value)}
              />
            </div>
          </div>

          <div className="adm-filter-wrap">
            <div className="adm-filter-group">
              <span className="adm-filter-label">Status</span>
              {PAYMENT_STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  className={`adm-filter-btn ${paymentStatusFilter === s ? 'adm-filter-btn--active' : ''}`}
                  onClick={() => handlePaymentStatusChange(s)}
                >
                  {s === 'ALL' ? 'All' : s}
                </button>
              ))}
            </div>

            <div className="adm-filter-group">
              <span className="adm-filter-label">Course</span>
              <select
                className="adm-filter-select"
                value={paymentCourseFilter}
                onChange={(e) => handlePaymentCourseChange(e.target.value)}
              >
                <option value="ALL">All Courses</option>
                {paymentCourseOptions.map((course) => (
                  <option key={course.courseId} value={course.courseId}>{course.title}</option>
                ))}
              </select>
            </div>
          </div>

          {paymentLoading && (
            <LoadingState message="Loading payments…" />
          )}

          {!paymentLoading && paymentError && (
            <LoadingState variant="error" message={paymentError} />
          )}

          {!paymentLoading && !paymentError && payments.length === 0 && (
            <div className="adm-payments-state">
              <span className="adm-state-icon"><img src={emptyPaymentsIcon} alt="No payments" /></span>
              <p>No payments found.</p>
            </div>
          )}

          {!paymentLoading && !paymentError && payments.length > 0 && (
            <div className="adm-table-wrap adm-table-wrap--maroon">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>OR Number</th>
                    <th>Student</th>
                    <th>Batch</th>
                    <th>Amount</th>
                    <th>Payment Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment, idx) => (
                    <tr
                      key={payment.publicId}
                      className="adm-table-row"
                      style={{ animationDelay: `${idx * 40}ms` }}
                      onClick={() => navigate(`/dashboard/payments/${payment.publicId}`)}
                      title="View payment detail"
                    >
                      <td className="adm-td-or-number">{payment.orNumber}</td>
                      <td className="adm-td-course">
                        <span className="adm-course-name">{payment.studentName}</span>
                      </td>
                      <td>{payment.batchName}</td>
                      <td>{formatCurrency(payment.amount)}</td>
                      <td className="adm-td-date">{formatDate(payment.paymentDate)}</td>
                      <td>
                        <span className={`adm-badge adm-badge--payment-${payment.status.toLowerCase()}`}>
                          {payment.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!paymentLoading && !paymentError && paymentTotalCount > 0 && (
            <div className="adm-payments-pagination">
              <span className="adm-payments-pagination-info">Page {paymentPage} of {paymentTotalPages}</span>
              <div className="adm-payments-pagination-controls">
                <button className="adm-payments-page-btn" disabled={paymentPage <= 1} onClick={() => setPaymentPage((p) => p - 1)}>Previous</button>
                <button className="adm-payments-page-btn" disabled={paymentPage >= paymentTotalPages} onClick={() => setPaymentPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          )}

          <button
            className="adm-fab"
            onClick={() => setShowAddPaymentModal(true)}
            title="Add new payment"
            aria-label="Add new payment"
          >
            <svg className="adm-fab-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 5V19M5 12H19" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {showAddPaymentModal && (
            <AddPaymentModal
              onClose={() => setShowAddPaymentModal(false)}
              onCreated={handlePaymentCreated}
            />
          )}
        </>
      )}

      {/* ════════════════════════════════════
          REFUNDS TAB
          ════════════════════════════════════ */}
      {mainTab === 'refunds' && (
        <>
          <div className="adm-search-wrap">
            <div className="adm-search-row">
              <input
                type="text"
                className="adm-search-input"
                placeholder="Search by refund number or student name…"
                value={refundSearch}
                onChange={(e) => handleRefundSearchChange(e.target.value)}
              />
            </div>
          </div>

          <div className="adm-filter-wrap">
            <div className="adm-filter-group">
              <span className="adm-filter-label">Status</span>
              {REFUND_STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  className={`adm-filter-btn ${refundStatusFilter === s ? 'adm-filter-btn--active' : ''}`}
                  onClick={() => handleRefundStatusChange(s)}
                >
                  {s === 'ALL' ? 'All' : s}
                </button>
              ))}
            </div>

            <div className="adm-filter-group">
              <span className="adm-filter-label">Course</span>
              <select
                className="adm-filter-select"
                value={refundCourseFilter}
                onChange={(e) => handleRefundCourseChange(e.target.value)}
              >
                <option value="ALL">All Courses</option>
                {refundCourseOptions.map((course) => (
                  <option key={course.courseId} value={course.courseId}>{course.title}</option>
                ))}
              </select>
            </div>
          </div>

          {refundLoading && (
            <LoadingState message="Loading refunds…" />
          )}

          {!refundLoading && refundError && (
            <LoadingState variant="error" message={refundError} />
          )}

          {!refundLoading && !refundError && refunds.length === 0 && (
            <div className="adm-payments-state">
              <span className="adm-state-icon"><img src={emptyPaymentsIcon} alt="No refunds" /></span>
              <p>No refunds found.</p>
            </div>
          )}

          {!refundLoading && !refundError && refunds.length > 0 && (
            <div className="adm-table-wrap adm-table-wrap--maroon">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Refund Number</th>
                    <th>Student</th>
                    <th>Course</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {refunds.map((refund, idx) => (
                    <tr
                      key={refund.publicId}
                      className="adm-table-row"
                      style={{ animationDelay: `${idx * 40}ms` }}
                      onClick={() => navigate(`/dashboard/refunds/${refund.publicId}`)}
                      title="View refund detail"
                    >
                      <td className="adm-td-or-number">{refund.refundNumber}</td>
                      <td className="adm-td-course">
                        <span className="adm-course-name">{refund.studentName}</span>
                      </td>
                      <td>{refund.courseTitle}</td>
                      <td>{formatCurrency(refund.amount)}</td>
                      <td>
                        <span className={`adm-badge adm-badge--payment-${refund.status.toLowerCase()}`}>
                          {refund.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!refundLoading && !refundError && refundTotalCount > 0 && (
            <div className="adm-payments-pagination">
              <span className="adm-payments-pagination-info">Page {refundPage} of {refundTotalPages}</span>
              <div className="adm-payments-pagination-controls">
                <button className="adm-payments-page-btn" disabled={refundPage <= 1} onClick={() => setRefundPage((p) => p - 1)}>Previous</button>
                <button className="adm-payments-page-btn" disabled={refundPage >= refundTotalPages} onClick={() => setRefundPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          )}

          <button
            className="adm-fab"
            onClick={() => setShowAddRefundModal(true)}
            title="Add new refund"
            aria-label="Add new refund"
          >
            <svg className="adm-fab-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 5V19M5 12H19" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {showAddRefundModal && (
            <AddRefund
              onClose={() => setShowAddRefundModal(false)}
              onCreated={handleRefundCreated}
            />
          )}
        </>
      )}
    </div>
  );
}

export default Payments;