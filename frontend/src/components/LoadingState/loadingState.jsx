// => components/LoadingState/loadingState.jsx
// => Shared loading/error state - spinner + message, or a warning icon +
//    message + optional Retry button. Replaces the sdaw-state/ppw-state/
//    faqw-state duplicates, which were the same markup with only the
//    class prefix changed each time.
// => variant: 'loading' (default) shows a spinning ring; 'error' shows a
//    warning icon and, if onRetry is passed, a Retry button.

import React from 'react';
import './loadingState.css';

export default function LoadingState({ variant = 'loading', message, onRetry }) {
  if (variant === 'error') {
    return (
      <div className="ls-wrap ls-wrap--error">
        <span className="ls-icon">⚠</span>
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