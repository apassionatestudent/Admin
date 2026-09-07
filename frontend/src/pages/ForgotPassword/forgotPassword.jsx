import React, { useState } from 'react';
import axios from 'axios';
// => Plain axios here, not axiosAdmin - this page runs with no admin
// => session yet, so there's no CSRF token to attach, same reasoning
// => as setAdminPassword.jsx
import { Link } from 'react-router-dom';

import '../Login/Login.css';
import logo from './../../assets/logo.jpg';
import emailIcon from './../../assets/email.png';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // => Tracks whether the request has been sent, swaps the form out for
  // => a confirmation message. The backend always returns the same generic
  // => message regardless of whether the email exists, so there is nothing
  // => to branch on here besides success vs a hard network/server failure
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');

    try {
      // => proxied to http://localhost:3000 via vite.config.js, same as Login.jsx
      await axios.post('/api/admin-auth/forgot-password', { email });
      setIsSubmitted(true);
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="login">
      <div className="login-glow login-glow-1"></div>
      <div className="login-glow login-glow-2"></div>
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo-wrap">
            <img
              src={logo}
              alt="Prime Logo"
              className="login-logo"
            />
          </div>
          <span className="login-tag">
            PRIME PORTAL
          </span>
          <h1>Forgot Password</h1>
          <p>
            {isSubmitted
              ? 'Check your email for a reset link'
              : 'Enter your email and we will send you a reset link'}
          </p>
        </div>

        {isSubmitted ? (
          // => Same generic message the backend returns, whether or not
          // => the email belongs to an account
          <p className="login-footer">
            If an account exists for that email, a reset link has been sent.
          </p>
        ) : (
          <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email Address</label>
              <div className="input-wrap">
                <img src={emailIcon} alt="" className="input-icon" />
                <input
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                />
              </div>
            </div>

            {errorMessage && (
              <div className="login-locked-banner">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              className="login-btn"
              disabled={isLoading}
            >
              {isLoading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        )}

        <div className="login-divider">
          <span></span>
        </div>

        <p className="login-footer">
          <Link to="/">Back to Sign In</Link>
        </p>
      </div>
    </main>
  );
}
