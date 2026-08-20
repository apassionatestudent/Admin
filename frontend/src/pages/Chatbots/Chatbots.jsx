import React, { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import axiosAdmin from '../../utils/axiosAdmin.js';
import LoadingState from '../../components/LoadingState/loadingState.jsx';
import AddChatbotModal from '../../components/Chatbots/AddChatbotModal/addChatbotModal.jsx';
import plusIcon from '../../assets/icons/plus.png';
import './chatbots.css';

export default function Chatbots() {
  const navigate = useNavigate();
  const { admin } = useOutletContext();

  // => Belt-and-suspenders redirect, same pattern as SupportTickets.jsx
  useEffect(() => {
    if (admin && admin.role !== 'super_admin' && !admin.sections?.includes('chatbots')) {
      navigate('/dashboard');
    }
  }, [admin, navigate]);

  const [chatbots, setChatbots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    fetchChatbots();
  }, []);

  const fetchChatbots = async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await axiosAdmin.get('/api/admin/chatbots');
      setChatbots(res.data.data);
    } catch (error) {
      console.error('Failed to fetch chatbots:', error);
      setFetchError('Failed to load chatbots. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // => New chatbot from the modal gets prepended so it's visible without
  //    a full refetch
  const handleChatbotCreated = (newChatbot) => {
    setChatbots((prev) => [newChatbot, ...prev]);
    setShowAddModal(false);
  };

  const statusClass = (status) => `status-badge status-badge-${status}`;

  const scopeLabel = (bot) => {
    if (bot.scope_type === 'public_site') return 'Public Site (Home + About)';
    if (bot.scope_type === 'student_dashboard') return 'Student Dashboard';
    if (bot.scope_type === 'tesda_course' || bot.scope_type === 'shs_course') {
      // => course_title/course_level come from findAllChatbots' join -
      //    fall back to the raw id if a course was since deleted and the
      //    join comes back null
      return bot.course_title
        ? `${bot.course_title} (${bot.course_level})`
        : `${bot.scope_type === 'tesda_course' ? 'TESDA' : 'SHS'} Course #${bot.course_id}`;
    }
    return bot.scope_type;
  };

  return (
    <main className="chatbots-page">
      <div className="chatbots-header">
        <div>
          <h2>Chatbots</h2>
          <p className="chatbots-subtitle">Manage the AI assistants shown on the public site and student dashboard.</p>
        </div>
      </div>

      {loading ? (
        <LoadingState message="Loading chatbots…" />
      ) : fetchError ? (
        <LoadingState variant="error" message={fetchError} onRetry={fetchChatbots} />
      ) : (
        <table className="chatbots-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Widget Header</th>
              <th>Scope</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {chatbots.length === 0 ? (
              <tr>
                <td colSpan={4} className="chatbots-empty">No chatbots yet. Click "Add Chatbot" to create one.</td>
              </tr>
            ) : (
              chatbots.map((bot) => (
                <tr
                  key={bot.public_id}
                  className="chatbots-row"
                  onClick={() => navigate(`/dashboard/chatbots/${bot.public_id}`)}
                >
                  <td>{bot.name}</td>
                  <td>{bot.widget_header_title}</td>
                  <td>{scopeLabel(bot)}</td>
                  <td><span className={statusClass(bot.status)}>{bot.status}</span></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}

      {/* => Floating action button, bottom-right, matches the pattern
             used on the Staff page rather than an inline header button */}
      <button className="chatbots-fab" onClick={() => setShowAddModal(true)} title="Add Chatbot">
        <span className="chatbots-fab-icon">+</span>
      </button>

      <AddChatbotModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={handleChatbotCreated}
      />
    </main>
  );
}