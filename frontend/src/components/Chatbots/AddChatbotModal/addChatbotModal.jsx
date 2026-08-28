import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import axiosAdmin from '../../../utils/axiosAdmin.js';
import closeIcon from '../../../assets/icons/close.png';
import './addChatbotModal.css';

// => Course dropdown only appears for these two scopes
const COURSE_SCOPE_TYPES = ['tesda_course', 'shs_course'];

// => student_dashboard removed from selectable scopes per admin request -
//    only these three remain
const SCOPE_LABELS = {
  public_site: 'Public Site (Home + About)',
  tesda_course: 'TESDA Course',
  shs_course: 'SHS Course',
};

export default function AddChatbotModal({ isOpen, onClose, onCreated, existingChatbots = [] }) {
  const [name, setName] = useState('');
  const [widgetHeaderTitle, setWidgetHeaderTitle] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [instructions, setInstructions] = useState('');
  const [context, setContext] = useState('');
  const [scopeType, setScopeType] = useState('public_site');
  const [courseId, setCourseId] = useState('');
  const [courseOptions, setCourseOptions] = useState([]);
  const [courseLoading, setCourseLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // => Response shape assumed as { data: [{ course_id, course_name }] } -
  //    verify against your actual tesdaCoursesRoutes.js / shsCoursesRoutes.js
  //    and adjust the field names below if they differ
  useEffect(() => {
    if (!COURSE_SCOPE_TYPES.includes(scopeType)) {
      setCourseOptions([]);
      setCourseId('');
      return;
    }

    const endpoint = scopeType === 'tesda_course' ? '/api/admin/tesda-courses' : '/api/admin/shs-courses';
    setCourseLoading(true);
    setCourseId('');
    axiosAdmin.get(endpoint)
      .then((res) => setCourseOptions(res.data.data || []))
      .catch((error) => {
        console.error('Failed to fetch courses:', error);
        toast.error('Failed to load course list.');
      })
      .finally(() => setCourseLoading(false));
  }, [scopeType]);

  // => public_site can only ever be claimed once. Once any chatbot
  //    (active or inactive) has it, it drops out of the Scope dropdown
  //    entirely so admins can't attempt a duplicate.
  const publicSiteTaken = existingChatbots.some((bot) => bot.scope_type === 'public_site');
  const availableScopeTypes = Object.keys(SCOPE_LABELS).filter((type) => {
    if (type === 'public_site') return !publicSiteTaken;
    return true;
  });

  // => Courses already claimed by another chatbot (any status) for this
  //    scope type are filtered out of the Course dropdown
  const takenCourseIds = existingChatbots
    .filter((bot) => bot.scope_type === scopeType)
    .map((bot) => bot.course_id);
  const visibleCourseOptions = courseOptions.filter((c) => !takenCourseIds.includes(c.course_id));

  // => If the modal opens on a scope that's since become unavailable
  //    (public_site got taken, or it was left on a removed scope), fall
  //    back to the first scope that's still open instead of showing a
  //    dead option
  useEffect(() => {
    if (isOpen && !availableScopeTypes.includes(scopeType) && availableScopeTypes.length > 0) {
      setScopeType(availableScopeTypes[0]);
    }
  }, [isOpen, availableScopeTypes, scopeType]);

  if (!isOpen) return null;

  const resetAndClose = () => {
    setName('');
    setWidgetHeaderTitle('');
    setWelcomeMessage('');
    setInstructions('');
    setContext('');
    setScopeType('public_site');
    setCourseId('');
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim() || !widgetHeaderTitle.trim() || !welcomeMessage.trim() || !instructions.trim()) {
      toast.error('Name, widget header, welcome message, and instructions are required.');
      return;
    }

    if (COURSE_SCOPE_TYPES.includes(scopeType) && !courseId) {
      toast.error('Please select a course for this scope.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await axiosAdmin.post('/api/admin/chatbots', {
        name: name.trim(),
        widgetHeaderTitle: widgetHeaderTitle.trim(),
        welcomeMessage: welcomeMessage.trim(),
        instructions: instructions.trim(),
        context: context.trim(),
        scopeType,
        courseId: COURSE_SCOPE_TYPES.includes(scopeType) ? Number(courseId) : null,
      });
      toast.success('Chatbot created. It starts inactive - use Test before switching it on.');
      onCreated(res.data.data);
      resetAndClose();
    } catch (error) {
      console.error('Failed to create chatbot:', error);
      toast.error(error.response?.data?.message || 'Failed to create chatbot.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    // => Backdrop no longer closes the modal on click - accidental clicks
    //    outside were wiping unsaved form data. Closing now requires the
    //    explicit X button or Cancel.
    <div className="chatbot-modal-backdrop">
      <div className="chatbot-modal-panel">
        <div className="chatbot-modal-header">
          <h3 className="chatbot-modal-title">Add Chatbot</h3>
          <button
            type="button"
            className="chatbot-modal-close-btn"
            onClick={resetAndClose}
            disabled={submitting}
            title="Close"
          >
            <img src={closeIcon} alt="Close" className="chatbot-modal-close-icon" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="chatbot-modal-form">
          <label className="chatbot-modal-label">
            Internal Name *
            <input
              type="text"
              className="chatbot-modal-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. PrimeEnroll Assistant"
            />
          </label>

          <label className="chatbot-modal-label">
            Widget Header Title *
            <input
              type="text"
              className="chatbot-modal-input"
              value={widgetHeaderTitle}
              onChange={(e) => setWidgetHeaderTitle(e.target.value)}
              placeholder='e.g. "Start chatting with PrimeEnroll"'
            />
          </label>

          <label className="chatbot-modal-label">
            Welcome Message *
            <textarea
              className="chatbot-modal-textarea"
              rows={2}
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              placeholder="First message shown when a visitor opens the chat"
            />
          </label>

          <label className="chatbot-modal-label">
            Instructions *
            <textarea
              className="chatbot-modal-textarea"
              rows={5}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="What the bot should do, its tone, and its limitations - this is the core system prompt"
            />
          </label>

          <label className="chatbot-modal-label">
            Context <span className="chatbot-modal-optional">(optional)</span>
            <textarea
              className="chatbot-modal-textarea"
              rows={4}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Background info the bot should know - course lists, policies, requirements, etc."
            />
          </label>

          <label className="chatbot-modal-label">
            Scope *
            <select
              className="chatbot-modal-select"
              value={scopeType}
              onChange={(e) => setScopeType(e.target.value)}
            >
              {availableScopeTypes.map((type) => (
                <option key={type} value={type}>{SCOPE_LABELS[type]}</option>
              ))}
            </select>
          </label>

          {COURSE_SCOPE_TYPES.includes(scopeType) && (
            <label className="chatbot-modal-label">
              Course *
              <select
                className="chatbot-modal-select"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                disabled={courseLoading}
              >
                <option value="">{courseLoading ? 'Loading courses…' : 'Select a course'}</option>
                {visibleCourseOptions.map((c) => (
                  <option key={c.course_id} value={c.course_id}>
                    {c.title} ({scopeType === 'tesda_course' ? c.certification_type : c.grade_level})
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="chatbot-modal-actions">
            <button type="button" className="chatbot-modal-btn-secondary" onClick={resetAndClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="chatbot-modal-btn-primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Chatbot'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}