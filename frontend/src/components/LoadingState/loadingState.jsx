// => components/LoadingState/loadingState.jsx
// => Shared loading/error state - spinner + message, or a warning icon +
//    message + optional Retry button. Replaces the sdaw-state/ppw-state/
//    faqw-state duplicates, which were the same markup with only the
//    class prefix changed each time.
// => variant: 'loading' (default) shows a spinning ring; 'error' shows a
//    warning icon and, if onRetry is passed, a Retry button.

import React from 'react';
import './loadingState.css';
// => Actual PNG icon instead of a text character, resolved by Vite at build time
import warningIcon from '../../assets/icons/warning.png';

export default function LoadingState({ variant = 'loading', message, onRetry }) {
  if (variant === 'error') {
    return (
      <div className="ls-wrap ls-wrap--error">
        {/* => alt text kept for accessibility, no visible text label */}
        <img src={warningIcon} alt="Warning" className="ls-icon" />
        <p>{message}</p>
        {onRetry && (
          <button className="ls-retry-btn" onClick={onRetry}>Retry</button>
        )}
      </div>
    );
  }

  return (
    <div className="ls-wrap">
      <div className="ls-spinner" />
      <p>{message}</p>
    </div>
  );
}