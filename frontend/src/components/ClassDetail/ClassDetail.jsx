// => admin/components/ClassDetail/ClassDetail.jsx
// => Full detail view for a single class
// => Mirrors EnrollmentDetail.jsx pattern

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import BackButton from '../BackButton/BackButton.jsx';

import './ClassDetail.css';

// => Maps status to CSS modifier class
const statusClass = {
  'Planned':   'status--planned',
  'Ongoing':   'status--ongoing',
  'Concluded': 'status--concluded',
};

// => Handles both plain DATE strings ('2026-06-01') and
// => full ISO timestamps ('2026-06-01T00:00:00.000Z') from the pg driver
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  // => Slice to just the date part regardless of what the driver returns
  const datePart = String(dateStr).slice(0, 10); // => '2026-06-01'
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
};

// => Formats ISO datetime to readable local time
const formatDateTime = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

// => Derives full name from profile fields
const fullName = (row) => {
  const parts = [row.first_name, row.middle_name, row.surname, row.name_extension]
    .filter(v => v && v.trim().toUpperCase() !== 'N/A');
  return parts.length ? parts.join(' ') : row.student_email ?? '-';
};

// => Status colors for enrollment badges inside the students table
const enrollmentStatusClass = {
  'Pending':             'status--pending',
  'Approved':            'status--approved',
  'Needs Clarification': 'status--clarification',
  'Rejected':            'status--rejected',
  'Dropped':             'status--dropped',
  'Completed':           'status--completed',
  'Reserved':            'status--reserved',
};

export default function ClassDetail() {
  const { publicId } = useParams();
  const navigate     = useNavigate();

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // => Status changer state
  const [selectedStatus, setSelectedStatus] = useState('');
  const [statusSaving,   setStatusSaving]   = useState(false);
  const [saveMsg,        setSaveMsg]        = useState(null); // => { type: 'success'|'error', text: string }

  // => Fetch class detail on mount
  useEffect(() => {
    const fetchDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/classes/${publicId}`, {
          credentials: 'include',
        });
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error || 'Failed to fetch class detail.');
        }
        const json = await res.json();
        setData(json);
        // => Pre-fill the status selector with current status
        setSelectedStatus(json.classRow.status);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [publicId]);

  // => Save updated status to backend
  const handleSaveStatus = async () => {
    if (!selectedStatus || selectedStatus === data?.classRow.status) return;

    setStatusSaving(true);
    setSaveMsg(null);

    try {
      const res = await fetch(`/api/admin/classes/${publicId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: selectedStatus }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to update status.');

      // => Update local state so the hero badge reflects immediately
      setData(prev => ({
        ...prev,
        classRow: { ...prev.classRow, status: body.updated.status },
      }));
      setSaveMsg({ type: 'success', text: 'Status updated successfully.' });
    } catch (err) {
      setSaveMsg({ type: 'error', text: err.message });
    } finally {
      setStatusSaving(false);
    }
  };

  
  // RENDER STATES
  

  if (loading) {
    return (
      <div className="adm-class-detail-page">
        <div className="adm-class-detail-state">
          <div className="adm-spinner" />
          <p>Loading class details…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="adm-class-detail-page">
        <BackButton destination="Classes" onClick={() => navigate('/dashboard/classes')} />
        <div className="adm-class-detail-state adm-class-detail-state--error">
          <span>⚠ {error}</span>
        </div>
      </div>
    );
  }

  const { classRow, enrolledStudents } = data;

  // => Remaining slots
  const remainingSlots = classRow.max_students - (enrolledStudents?.length ?? 0);

  return (
    <div className="adm-class-detail-page">

      {/* Back button */}
      <BackButton destination="Classes" onClick={() => navigate('/dashboard/classes')} />


      <div className="adm-class-detail-body">

        {/* ════════════════════════════════════
            HERO HEADER
            ════════════════════════════════════ */}
        <div className="adm-class-detail-hero">
          <div className="adm-hero-left">
            {/* => Sector above the course name */}
            <p className="adm-hero-sector">{classRow.sector ?? 'No Sector'}</p>
            <h1 className="adm-hero-course-name">{classRow.course_name ?? '-'}</h1>
            <p className="adm-hero-branch">{classRow.branch_name ?? '-'}</p>
          </div>

          <span className={`adm-hero-badge ${statusClass[classRow.status] || ''}`}>
            {classRow.status}
          </span>
        </div>

        {/* ════════════════════════════════════
            STATUS CHANGER
            ════════════════════════════════════ */}
        <div className="adm-class-section">
          <p className="adm-section-title">Update Status</p>
          <div className="adm-status-changer">
            <select
              className="adm-status-select"
              value={selectedStatus}
              onChange={e => { setSelectedStatus(e.target.value); setSaveMsg(null); }}
            >
              <option value="Planned">Planned</option>
              <option value="Ongoing">Ongoing</option>
              <option value="Concluded">Concluded</option>
            </select>

            <button
              className="adm-status-btn"
              onClick={handleSaveStatus}
              disabled={statusSaving || selectedStatus === classRow.status}
            >
              {statusSaving ? 'Saving…' : 'Save Status'}
            </button>

            {saveMsg && (
              <span className={`adm-save-msg adm-save-msg--${saveMsg.type}`}>
                {saveMsg.text}
              </span>
            )}
          </div>
        </div>

        {/* ════════════════════════════════════
            CLASS INFO GRID
            ════════════════════════════════════ */}
        <div className="adm-class-section">
          <p className="adm-section-title">Class Information</p>
          <div className="adm-info-grid">

            <div className="adm-info-card">
              <p className="adm-info-label">Course</p>
              <p className="adm-info-value">{classRow.course_name ?? '-'}</p>
            </div>

            {classRow.duration_hours && (
              <div className="adm-info-card">
                <p className="adm-info-label">Duration</p>
                <p className="adm-info-value">{classRow.duration_hours} hours</p>
              </div>
            )}

            <div className="adm-info-card">
              <p className="adm-info-label">Sector</p>
              <p className="adm-info-value">{classRow.sector ?? '-'}</p>
            </div>

            <div className="adm-info-card">
              <p className="adm-info-label">Branch</p>
              <p className="adm-info-value">{classRow.branch_name ?? '-'}</p>
            </div>

            <div className="adm-info-card">
              <p className="adm-info-label">Start Date</p>
              <p className="adm-info-value">{formatDate(classRow.start_date)}</p>
            </div>

            <div className="adm-info-card">
              <p className="adm-info-label">End Date</p>
              <p className="adm-info-value">{formatDate(classRow.end_date)}</p>
            </div>

            <div className="adm-info-card">
              <p className="adm-info-label">Required Students</p>
              <p className="adm-info-value">{classRow.required_number_of_students}</p>
            </div>

            <div className="adm-info-card">
              <p className="adm-info-label">Max Students</p>
              <p className="adm-info-value">{classRow.max_students}</p>
            </div>

            <div className="adm-info-card">
              <p className="adm-info-label">Enrolled</p>
              <p className="adm-info-value">
                {enrolledStudents?.length ?? 0}
                {' '}
                <span className="adm-slots-note">
                  ({remainingSlots > 0 ? `${remainingSlots} slot${remainingSlots !== 1 ? 's' : ''} remaining` : 'Full'})
                </span>
              </p>
            </div>

            <div className="adm-info-card">
              <p className="adm-info-label">Last Updated</p>
              <p className="adm-info-value">{formatDateTime(classRow.updated_at)}</p>
            </div>

            {classRow.created_by_name && (
              <div className="adm-info-card">
                <p className="adm-info-label">Created By</p>
                <p className="adm-info-value">{classRow.created_by_name}</p>
              </div>
            )}

          </div>

          {/* => Remarks */}
          {classRow.remarks && (
            <div className="adm-remarks-box">
              <p className="adm-info-label">Remarks</p>
              <p className="adm-remarks-text">{classRow.remarks}</p>
            </div>
          )}
        </div>

        {/* ════════════════════════════════════
            INSTRUCTOR SECTION
            ════════════════════════════════════ */}
        <div className="adm-class-section">
          <p className="adm-section-title">Instructor</p>

          {classRow.instructor_name ? (
            <div className="adm-info-grid">
              <div className="adm-info-card">
                <p className="adm-info-label">Full Name</p>
                <p className="adm-info-value">{classRow.instructor_name}</p>
              </div>

              {classRow.instructor_contact && (
                <div className="adm-info-card">
                  <p className="adm-info-label">Contact Number</p>
                  <p className="adm-info-value">{classRow.instructor_contact}</p>
                </div>
              )}

              {classRow.instructor_email && (
                <div className="adm-info-card">
                  <p className="adm-info-label">Email</p>
                  <p className="adm-info-value">{classRow.instructor_email}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="adm-empty-note">No instructor assigned yet.</p>
          )}
        </div>

        {/* ════════════════════════════════════
            ENROLLED STUDENTS TABLE
            ════════════════════════════════════ */}
        <div className="adm-class-section">
          <p className="adm-section-title">
            Enrolled Students
            <span className="adm-section-count-inline">{enrolledStudents?.length ?? 0}</span>
          </p>

          {!enrolledStudents || enrolledStudents.length === 0 ? (
            <p className="adm-empty-note">No students enrolled in this class yet.</p>
          ) : (
            <div className="adm-sub-table-wrap">
              <table className="adm-sub-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Email</th>
                    <th>Enrollment Status</th>
                    <th>Submitted</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {enrolledStudents.map((s) => (
                    <tr
                      key={s.enrollment_public_id}
                      className="adm-sub-table-row"
                      onClick={() => navigate(`/dashboard/enrollments/${s.enrollment_public_id}`)}
                      title="View enrollment detail"
                    >
                      <td className="adm-td-student-name">{fullName(s)}</td>
                      <td className="adm-td-email">{s.student_email}</td>
                      <td>
                        <span className={`adm-badge ${enrollmentStatusClass[s.enrollment_status] || ''}`}>
                          {s.enrollment_status}
                        </span>
                      </td>
                      <td className="adm-td-date">
                        {s.submitted_at
                          ? new Date(s.submitted_at).toLocaleDateString('en-PH', {
                              year: 'numeric', month: 'short', day: 'numeric',
                            })
                          : '-'}
                      </td>
                      <td className="adm-td-arrow">›</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
