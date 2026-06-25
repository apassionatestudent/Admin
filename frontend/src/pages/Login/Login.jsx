import React, { useState } from 'react';
// import axios from 'axios';
// => axiosAdmin automatically attaches withCredentials and x-csrf-token header
import axiosAdmin from '../../api/axiosAdmin.js';

import { useNavigate } from 'react-router-dom';

import './Login.css';
import logo from './../../assets/logo.jpg';

import emailIcon from './../../assets/email.png';
import lockIcon from './../../assets/lock.png';

export default function Login() {
  const navigate = useNavigate();

  // => Login form state
  const [form, setForm] = useState({
    email: '',
    password: '',
  });

  // => Tracks loading state to disable button while request is in flight
  const [isLoading, setIsLoading] = useState(false);

  // => Holds error message returned from the backend
  const [error, setError] = useState(null);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null); // => clear previous errors on each attempt

    try {
      // => axiosAdmin handles withCredentials automatically
      const res = await axiosAdmin.post(
        '/api/admin-auth/login', // => proxied to http://localhost:3000 via vite.config.js
        { email: form.email, password: form.password }
      );

      // => Store CSRF token in sessionStorage so all subsequent mutation requests can use it
      // => axiosAdmin interceptor reads this and attaches it as x-csrf-token header automatically
      sessionStorage.setItem('csrfToken', res.data.csrfToken);

      // => No "Remember Me" for admins - session only, cleared when browser closes
      sessionStorage.setItem('isAdminLoggedIn', 'true');

      // => redirect to admin dashboard on successful login
      navigate('/dashboard');

    } catch (err) {
      // => show the error message returned from the backend
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="login">
      <div className="login-glow login-glow-1"></div>
      <div className="login-glow login-glow-2"></div>
      <div className="login-card">
        {/* => ::before pseudo-element handles the accent bar via CSS */}
        <div className="login-header">
          {/* => Logo now sits inside a styled tile for a premium look */}
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
          <h1>Welcome Back</h1>
          <p>
            Sign in to continue to the dashboard
          </p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email Address</label>
            {/* => input-wrap + input-icon adds the mail icon inside the field */}
            <div className="input-wrap">
              <img src={emailIcon} alt="" className="input-icon" />
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="Enter your email"
                required
              />
            </div>
          </div>
          <div className="form-group">
            <label>Password</label>
            {/* => input-wrap + input-icon adds the lock icon inside the field */}
            <div className="input-wrap">
              <img src={lockIcon} alt="" className="input-icon" />
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Enter your password"
                required
              />
            </div>
          </div>
          <div className="login-forgot">
            <a href="#">
              Forgot password?
            </a>
          </div>

          {/* => shows backend error messages such as invalid credentials or suspended account */}
          {error && <p className="login-error">{error}</p>}

          <button
            type="submit"
            className="login-btn"
            disabled={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <div className="login-divider">
          {/* => span renders as the gold center dot */}
          <span></span>
        </div>
        <p className="login-footer">
          PRIME Hospitality Training &amp; Assessment Center Inc.
        </p>
      </div>
    </main>
  );
}