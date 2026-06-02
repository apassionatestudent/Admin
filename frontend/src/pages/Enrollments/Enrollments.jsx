// => admin/pages/Enrollments/Enrollments.jsx
// => Displays all Pending and Needs Clarification enrollments for admin review

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import '../Enrollments/Enrollments.css';

// => Maps each status to a CSS modifier class - same convention as student side
const statusClass = {
  'Pending':             'status--pending',
  'Needs Clarification': 'status--clarification',
};

// => Formats ISO date string to a short readable date
const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
};

// => Derives student full name from profile fields
// => Filters out falsy values AND 'N/A' so name extension doesn't appear when not applicable
const fullName = (row) => {
  const parts = [row.first_name, row.middle_name, row.surname, row.name_extension]
    .filter(v => v && v.trim().toUpperCase() !== 'N/A');
  return parts.length ? parts.join(' ') : row.student_email ?? '—';
};

export default function Enrollments() {
  const navigate = useNavigate();

  const [enrollments, setEnrollments] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);

  // => Fetch pending enrollments on mount
  useEffect(() => {
    const fetchEnrollments = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/enrollments', {
          credentials: 'include', // => sends the httpOnly admin JWT cookie
        });
        if (!res.ok) throw new Error('Failed to fetch enrollments.');
        const data = await res.json();
        setEnrollments(data.enrollments);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchEnrollments();
  }, []);

  const handleRowClick = (publicId) => {
    // => Route must match App.jsx: /dashboard/enrollments/:publicId
    navigate(`/dashboard/enrollments/${publicId}`);
  };

  // => Split enrollments into two priority buckets for visual grouping
  const needsClarification = enrollments.filter(e => e.status === 'Needs Clarification');
  const pending            = enrollments.filter(e => e.status === 'Pending');

  return (
    <div className="adm-enroll-page">

      <div className="adm-enroll-header">
        <div>
          <h1 className="adm-enroll-title">Enrollments</h1>
          <p className="adm-enroll-subtitle">
            Showing <strong>Pending</strong> and <strong>Needs Clarification</strong> submissions.
          </p>
        </div>

        {/* => Live count badge */}
        {!loading && !error && (
          <div className="adm-enroll-count">
            <span className="adm-enroll-count-num">{enrollments.length}</span>
            <span className="adm-enroll-count-label">awaiting review</span>
          </div>
        )}
      </div>

      {/*  Loading state  */}
      {loading && (
        <div className="adm-enroll-state">
          <div className="adm-spinner" />
          <p>Loading enrollments…</p>
        </div>
      )}

      {/*  Error state  */}
      {!loading && error && (
        <div className="adm-enroll-state adm-enroll-state--error">
          <span className="adm-state-icon">⚠</span>
          <p>{error}</p>
        </div>
      )}

      {/*  Empty state  */}
      {!loading && !error && enrollments.length === 0 && (
        <div className="adm-enroll-state">
          <span className="adm-state-icon">✓</span>
          <p>All caught up — no pending enrollments.</p>
        </div>
      )}

      {/*  Needs Clarification group (shown first — higher urgency)  */}
      {!loading && !error && needsClarification.length > 0 && (
        <section className="adm-enroll-section">
          <h2 className="adm-section-label adm-section-label--clarification">
            Needs Clarification
            <span className="adm-section-count">{needsClarification.length}</span>
          </h2>
          <EnrollmentTable rows={needsClarification} onRowClick={handleRowClick} />
        </section>
      )}

      {/*  Pending group  */}
      {!loading && !error && pending.length > 0 && (
        <section className="adm-enroll-section">
          <h2 className="adm-section-label adm-section-label--pending">
            Pending
            <span className="adm-section-count">{pending.length}</span>
          </h2>
          <EnrollmentTable rows={pending} onRowClick={handleRowClick} />
        </section>
      )}

    </div>
  );
}

// 
// EnrollmentTable — reusable table sub-component
// 
function EnrollmentTable({ rows, onRowClick }) {
  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Course</th>
            <th>Sector</th>
            <th>Branch</th>
            <th>Assessment</th>
            <th>Submitted</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={row.public_id}
              className="adm-table-row"
              style={{ animationDelay: `${idx * 40}ms` }}
              onClick={() => onRowClick(row.public_id)}
            >
              <td className="adm-td-student">
                <span className="adm-student-name">{fullName(row)}</span>
                <span className="adm-student-email">{row.student_email}</span>
              </td>
              <td>{row.course_name ?? '—'}</td>
              <td>{row.sector ?? '—'}</td>
              <td>{row.branch_name ?? '—'}</td>
              <td>{row.assessment_type ?? '—'}</td>
              <td className="adm-td-date">{formatDate(row.submitted_at)}</td>
              <td>
                <span className={`adm-badge ${statusClass[row.status] || ''}`}>
                  {row.status}
                </span>
              </td>
              <td className="adm-td-arrow">›</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
