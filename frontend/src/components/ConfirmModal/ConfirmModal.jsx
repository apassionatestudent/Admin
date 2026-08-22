// => admin/components/ConfirmModal/ConfirmModal.jsx
// => Reusable yes/no confirmation modal
// => Props:
//    - isOpen    : boolean - controls visibility
//    - message   : string  - the question shown to the admin
//    - onConfirm : fn      - called when admin clicks Yes
//    - onCancel  : fn      - called when admin clicks No or backdrop

import React from 'react';
import { createPortal } from 'react-dom';
import './ConfirmModal.css';

export default function ConfirmModal({ isOpen, message, onConfirm, onCancel }) {
  // => Don't render anything if not open
  if (!isOpen) return null;

  // => Rendered via portal straight into document.body instead of inline.
  //    SideBar.jsx renders this component inside <aside className="sidebar">,
  //    and .sidebar has a CSS transform applied while open (see SideBar.css's
  //    .sidebar--open). Any transform on an ancestor creates a new containing
  //    block for position:fixed descendants - so without the portal, this
  //    modal's "fixed; inset:0" backdrop only covered the sidebar's own box
  //    instead of the full viewport, which is why it rendered pinned to the
  //    upper-left instead of centered on screen.
  return createPortal(
    <div className="confirm-backdrop" onClick={onCancel}>
      <div
        className="confirm-box"
        onClick={e => e.stopPropagation()} // => prevent backdrop click from firing inside
      >
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="confirm-btn confirm-btn--yes" onClick={onConfirm}>
            Yes
          </button>
          <button className="confirm-btn confirm-btn--no" onClick={onCancel}>
            No
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}