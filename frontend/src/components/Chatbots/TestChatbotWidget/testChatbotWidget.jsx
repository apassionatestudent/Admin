import React, { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import axiosAdmin from '../../../utils/axiosAdmin.js';
import chatBubbleIcon from '../../../assets/icons/chat-bubble.png';
import closeIcon from '../../../assets/icons/close.png';
import './testChatbotWidget.css';

// => Same allowlist as chatbotGeminiService.js's sanitizeHtml call.
//    That backend sanitization is the real trust boundary - the bot's
//    reply is already safe by the time it reaches this component. This
//    second pass is defense-in-depth so this file doesn't itself contain
//    an unverified dangerouslySetInnerHTML sink, which is what CodeQL's
//    DOM-XSS check (js/xss-through-dom, "DOM text reinterpreted as HTML")
//    correctly flags - it can't see across into a separate backend
//    service to confirm the data was already cleaned.
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'ul', 'ol', 'li', 'a'],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
};

// => Test-only chat panel launched from ChatbotDetail. Nothing here is
//    persisted - messages live only in this component's state, so closing
//    the panel (which unmounts it) wipes the whole session. The
//    public/student-facing widget will be its own separate component in
//    the other codebase, built the same way (in-memory only, no
//    localStorage/sessionStorage) once a bot is ready to go live.
export default function TestChatbotWidget({ chatbotPublicId, headerTitle, welcomeMessage, onClose }) {
  const [messages, setMessages] = useState([]); // => [{ role: 'user' | 'model', text, isError? }]
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    // => Only actual exchanged messages go to the API - the welcome
    //    message is a UI-only greeting, never part of the conversation
    //    sent to Gemini
    const updatedMessages = [...messages, { role: 'user', text: trimmed }];
    setMessages(updatedMessages);
    setInput('');
    setSending(true);

    try {
      const res = await axiosAdmin.post(`/api/admin/chatbots/${chatbotPublicId}/test-message`, {
        messages: updatedMessages,
      });
      setMessages((prev) => [...prev, { role: 'model', text: res.data.reply }]);
    } catch (error) {
      console.error('Test message failed:', error);
      const errorText = error.response?.data?.message || 'The chatbot failed to respond. Please try again.';
      setMessages((prev) => [...prev, { role: 'model', text: errorText, isError: true }]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="test-widget-panel">
      <div className="test-widget-header">
        <div className="test-widget-header-title">
          <img src={chatBubbleIcon} alt="" className="test-widget-header-icon" />
          {headerTitle}
        </div>
        <button className="test-widget-close-btn" onClick={onClose} title="End test session">
          <img src={closeIcon} alt="Close" className="test-widget-close-icon" />
        </button>
      </div>

      <div className="test-widget-messages">
        <div className="test-widget-bubble test-widget-bubble-bot">
          <span className="test-widget-bubble-label">Bot</span>
          {welcomeMessage}
        </div>

        {messages.map((m, i) => (
          <div
            key={i}
            className={`test-widget-bubble ${m.role === 'user' ? 'test-widget-bubble-user' : 'test-widget-bubble-bot'} ${m.isError ? 'test-widget-bubble-error' : ''}`}
          >
            <span className="test-widget-bubble-label">{m.role === 'user' ? 'You' : 'Bot'}</span>
            {/* => Bot replies are already sanitized server-side (see
                   chatbotGeminiService.js), sanitized again here right
                   before the sink as defense-in-depth. User's own
                   messages stay plain text - never run through
                   dangerouslySetInnerHTML. */}
            {m.role === 'user' ? m.text : <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(m.text, SANITIZE_CONFIG) }} />}
          </div>
        ))}

        {sending && (
          <div className="test-widget-bubble test-widget-bubble-bot test-widget-bubble-typing">
            <span className="test-widget-bubble-label">Bot</span>
            Typing…
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="test-widget-input-row">
        <input
          type="text"
          className="test-widget-input"
          placeholder="Type your message here... (Press Enter to send)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
        />
        <button className="test-widget-send-btn" onClick={handleSend} disabled={sending || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}