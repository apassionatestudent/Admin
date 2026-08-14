import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import axiosAdmin from '../../../utils/axiosAdmin.js';
import LoadingState from '../../../components/LoadingState/loadingState.jsx';
import TestChatbotWidget from './../TestChatbotWidget/testChatbotWidget.jsx';
import trashIcon from '../../../assets/icons/trash.png';
import chatIcon from '../../../assets/icons/chat.png';
import BackButton from '../../BackButton/BackButton.jsx';
import ConfirmModal from '../../ConfirmModal/ConfirmModal.jsx';
import './chatbotDetail.css';

const COURSE_SCOPE_TYPES = ['tesda_course', 'shs_course'];
const LOGS_PER_PAGE = 10;

// => DESIGN PLACEHOLDER - no chatbot_logs table or endpoint exists yet.
//    Swap this out for a real fetch (e.g. GET /api/admin/chatbots/:publicId/logs)
//    once that backend piece is built. Kept here only so the layout below
//    can be reviewed with realistic-looking content.
const MOCK_LOGS = [
  { log_id: 1, created_at: '2026-08-14T06:20:00Z', performed_by_name: 'LoneWolf The Wolf', action: 'Activated', remarks: 'Chatbot switched from inactive to active.' },
  { log_id: 2, created_at: '2026-08-14T06:05:00Z', performed_by_name: 'LoneWolf The Wolf', action: 'Updated', remarks: 'Context field edited.' },
  { log_id: 3, created_at: '2026-08-13T22:41:00Z', performed_by_name: 'LoneWolf The Wolf', action: 'Created', remarks: 'Chatbot created with scope Public Site.' },
];

// => Same format used across the enrollment detail pages, for consistency
const formatDateTime = (isoString) => {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export default function ChatbotDetail() {
  const { publicId } = useParams();
  const navigate = useNavigate();

  const [chatbot, setChatbot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showTestWidget, setShowTestWidget] = useState(false);
  // => Which confirm dialog is open: null | 'save' | 'toggleStatus' | 'delete'
  const [confirmAction, setConfirmAction] = useState(null);

  const [form, setForm] = useState(null);
  const [courseOptions, setCourseOptions] = useState([]);
  const [courseLoading, setCourseLoading] = useState(false);
  const [logs] = useState(MOCK_LOGS); // => placeholder, see MOCK_LOGS note above
  const [logPage, setLogPage] = useState(1);

  useEffect(() => {
    fetchChatbot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicId]);

  // => Fetches the matching course list whenever the form's scope is (or
  //    becomes) course-scoped - same response-shape assumption as
  //    AddChatbotModal.jsx, verify against your actual course routes
  useEffect(() => {
    if (!form || !COURSE_SCOPE_TYPES.includes(form.scope_type)) {
      setCourseOptions([]);
      return;
    }

    const endpoint = form.scope_type === 'tesda_course' ? '/api/admin/tesda-courses' : '/api/admin/shs-courses';
    setCourseLoading(true);
    axiosAdmin.get(endpoint)
      .then((res) => setCourseOptions(res.data.data || []))
      .catch((error) => console.error('Failed to fetch courses:', error))
      .finally(() => setCourseLoading(false));
  }, [form?.scope_type]);

  const fetchChatbot = async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await axiosAdmin.get(`/api/admin/chatbots/${publicId}`);
      setChatbot(res.data.data);
      setForm(res.data.data);
    } catch (error) {
      console.error('Failed to fetch chatbot detail:', error);
      setFetchError('Failed to load this chatbot. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // => Switching scope in edit mode clears course_id if the new scope no
  //    longer needs one, mirroring the backend's validateScopeAndCourse
  const handleScopeChange = (value) => {
    setForm((prev) => ({
      ...prev,
      scope_type: value,
      course_id: COURSE_SCOPE_TYPES.includes(value) ? prev.course_id : null,
    }));
  };

  const handleSave = async () => {
    if (COURSE_SCOPE_TYPES.includes(form.scope_type) && !form.course_id) {
      toast.error('Please select a course for this scope.');
      return;
    }

    setSaving(true);
    try {
      const res = await axiosAdmin.patch(`/api/admin/chatbots/${publicId}`, {
        name: form.name,
        widgetHeaderTitle: form.widget_header_title,
        welcomeMessage: form.welcome_message,
        instructions: form.instructions,
        context: form.context,
        scopeType: form.scope_type,
        courseId: form.course_id || null,
        status: form.status,
      });
      setChatbot(res.data.data);
      setForm(res.data.data);
      setEditMode(false);
      toast.success('Chatbot updated.');
    } catch (error) {
      console.error('Failed to update chatbot:', error);
      toast.error(error.response?.data?.message || 'Failed to update chatbot.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setForm(chatbot);
    setEditMode(false);
  };

  const handleDelete = async () => {
    try {
      await axiosAdmin.delete(`/api/admin/chatbots/${publicId}`);
      toast.success('Chatbot deleted.');
      navigate('/dashboard/chatbots');
    } catch (error) {
      console.error('Failed to delete chatbot:', error);
      toast.error(error.response?.data?.message || 'Failed to delete chatbot.');
    }
  };

  // => Quick toggle straight from the header badge - separate from the
  //    general Save flow so switching status doesn't require edit mode
  const handleToggleStatus = async () => {
    const nextStatus = chatbot.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await axiosAdmin.patch(`/api/admin/chatbots/${publicId}`, { status: nextStatus });
      setChatbot(res.data.data);
      setForm(res.data.data);
      toast.success(`Chatbot is now ${nextStatus}.`);
    } catch (error) {
      console.error('Failed to toggle status:', error);
      toast.error(error.response?.data?.message || 'Failed to change status.');
    }
  };

  if (loading) return <LoadingState message="Loading chatbot…" />;
  if (fetchError) return <LoadingState variant="error" message={fetchError} onRetry={fetchChatbot} />;
  if (!chatbot) return null;

  return (
    <main className="chatbot-detail-page">
      <BackButton destination="Chatbots" onClick={() => navigate('/dashboard/chatbots')} />

      <div className="chatbot-detail-header">
        <div>
          <h2>{chatbot.name}</h2>
          {/* => Pure label now, not a control - the actual toggle is the
                 explicit Activate/Deactivate button below, so it's
                 obviously clickable instead of looking like a static pill */}
          <span className={`status-badge status-badge-${chatbot.status}`}>{chatbot.status}</span>
        </div>

        <div className="chatbot-detail-header-actions">
          {editMode ? (
            <>
              <button className="chatbot-detail-btn-secondary" onClick={handleCancelEdit} disabled={saving}>
                Cancel
              </button>
              <button className="chatbot-detail-btn-primary" onClick={() => setConfirmAction('save')} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </>
          ) : (
            <>
              <button className="chatbot-detail-btn-test" onClick={() => setShowTestWidget(true)}>
                <img src={chatIcon} alt="" className="chatbot-detail-test-icon" />
                Test
              </button>
              <button
                className={chatbot.status === 'active' ? 'chatbot-detail-btn-deactivate' : 'chatbot-detail-btn-activate'}
                onClick={() => setConfirmAction('toggleStatus')}
              >
                {chatbot.status === 'active' ? 'Deactivate' : 'Activate'}
              </button>
              <button className="chatbot-detail-btn-secondary" onClick={() => setEditMode(true)}>
                Edit
              </button>
              <button className="chatbot-detail-btn-danger" onClick={() => setConfirmAction('delete')}>
                <img src={trashIcon} alt="" className="chatbot-detail-danger-icon" />
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      <div className="chatbot-detail-form">
        <div className="chatbot-detail-row">
          <label className="chatbot-detail-label">
            Internal Name
            <input
              type="text"
              className="chatbot-detail-input"
              value={form.name}
              disabled={!editMode}
              onChange={(e) => handleFieldChange('name', e.target.value)}
            />
          </label>

          <label className="chatbot-detail-label">
            Widget Header Title
            <input
              type="text"
              className="chatbot-detail-input"
              value={form.widget_header_title}
              disabled={!editMode}
              onChange={(e) => handleFieldChange('widget_header_title', e.target.value)}
            />
          </label>
        </div>

        <label className="chatbot-detail-label">
          Welcome Message
          <textarea
            className="chatbot-detail-textarea"
            rows={2}
            value={form.welcome_message}
            disabled={!editMode}
            onChange={(e) => handleFieldChange('welcome_message', e.target.value)}
          />
        </label>

        <label className="chatbot-detail-label">
          Instructions
          <textarea
            className="chatbot-detail-textarea"
            rows={6}
            value={form.instructions}
            disabled={!editMode}
            onChange={(e) => handleFieldChange('instructions', e.target.value)}
          />
        </label>

        <label className="chatbot-detail-label">
          Context
          <textarea
            className="chatbot-detail-textarea"
            rows={5}
            value={form.context || ''}
            disabled={!editMode}
            onChange={(e) => handleFieldChange('context', e.target.value)}
          />
        </label>

        <div className="chatbot-detail-row">
          <label className="chatbot-detail-label">
            Scope
            <select
              className="chatbot-detail-select"
              value={form.scope_type}
              disabled={!editMode}
              onChange={(e) => handleScopeChange(e.target.value)}
            >
              <option value="public_site">Public Site (Home + About)</option>
              <option value="tesda_course">TESDA Course</option>
              <option value="shs_course">SHS Course</option>
              <option value="student_dashboard">Student Dashboard</option>
            </select>
          </label>

          {COURSE_SCOPE_TYPES.includes(form.scope_type) && (
            <label className="chatbot-detail-label">
              Course
              <select
                className="chatbot-detail-select"
                value={form.course_id || ''}
                disabled={!editMode || courseLoading}
                onChange={(e) => handleFieldChange('course_id', Number(e.target.value))}
              >
                <option value="">{courseLoading ? 'Loading courses…' : 'Select a course'}</option>
                {courseOptions.map((c) => (
                  <option key={c.course_id} value={c.course_id}>
                    {c.title} ({form.scope_type === 'tesda_course' ? c.certification_type : c.grade_level})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════
          ACTIVITY LOGS
          => Design reference: TESDAEnrollmentDetail's Activity Logs
             section. Own class names (chatbot-detail-log-*), no shared
             CSS file between admin pages per the no-shared-abstraction
             convention.
          ════════════════════════════════════ */}
      <section className="chatbot-detail-section">
        <h3 className="chatbot-detail-section-title">
          Activity Logs
          <span className="chatbot-detail-section-count">{logs.length}</span>
        </h3>

        {logs.length === 0 ? (
          <p className="chatbot-detail-empty-note">No activity recorded yet.</p>
        ) : (() => {
          const totalLogPages = Math.max(1, Math.ceil(logs.length / LOGS_PER_PAGE));
          const currentLogPage = Math.min(logPage, totalLogPages);
          const pagedLogs = logs.slice(
            (currentLogPage - 1) * LOGS_PER_PAGE,
            currentLogPage * LOGS_PER_PAGE
          );

          return (
            <>
              <div className="chatbot-detail-log-table-wrap">
                <table className="chatbot-detail-log-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedLogs.map((log, i) => (
                      <tr key={log.log_id ?? i}>
                        <td>{formatDateTime(log.created_at)}</td>
                        <td>{log.performed_by_name ?? 'System'}</td>
                        <td>{log.action}</td>
                        <td>{log.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalLogPages > 1 && (
                <div className="chatbot-detail-log-pagination">
                  <button
                    className="chatbot-detail-log-page-btn"
                    onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                    disabled={currentLogPage === 1}
                  >
                    Prev
                  </button>
                  {Array.from({ length: totalLogPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      className={`chatbot-detail-log-page-btn ${p === currentLogPage ? 'chatbot-detail-log-page-btn--active' : ''}`}
                      onClick={() => setLogPage(p)}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    className="chatbot-detail-log-page-btn"
                    onClick={() => setLogPage((p) => Math.min(totalLogPages, p + 1))}
                    disabled={currentLogPage === totalLogPages}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          );
        })()}
      </section>

      <ConfirmModal
        isOpen={confirmAction !== null}
        message={
          confirmAction === 'save'
            ? 'Save changes to this chatbot?'
            : confirmAction === 'toggleStatus'
              ? chatbot.status === 'active'
                ? 'Deactivate this chatbot? It will stop responding until reactivated.'
                : 'Activate this chatbot? It will start responding on its configured scope.'
              : confirmAction === 'delete'
                ? `Delete "${chatbot.name}"? This cannot be undone.`
                : ''
        }
        onConfirm={() => {
          if (confirmAction === 'save') handleSave();
          if (confirmAction === 'toggleStatus') handleToggleStatus();
          if (confirmAction === 'delete') handleDelete();
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />

      {showTestWidget && (
        <TestChatbotWidget
          chatbotPublicId={publicId}
          headerTitle={chatbot.widget_header_title}
          welcomeMessage={chatbot.welcome_message}
          onClose={() => setShowTestWidget(false)}
        />
      )}
    </main>
  );
}