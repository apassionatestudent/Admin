import React, { useState, useEffect } from 'react';
// import axios from 'axios';
// => axiosAdmin automatically attaches withCredentials and x-csrf-token header
import axiosAdmin from '../../utils/axiosAdmin.js';
// => toast handles ordinary login errors so the card doesn't stretch in height
import toast from 'react-hot-toast';

import { useNavigate } from 'react-router-dom';

import './Login.css';
import logo from './../../assets/logo.jpg';

import emailIcon from './../../assets/email.png';
import lockIcon from './../../assets/lock.png';
import eyeIcon from './../../assets/icons/eye.png';
import eyeOffIcon from './../../assets/icons/eye-off.png';

export default function Login() {
  const navigate = useNavigate();

  // => Login form state
  const [form, setForm] = useState({
    email: '',
    password: '',
  });

  // => Tracks loading state to disable button while request is in flight
  const [isLoading, setIsLoading] = useState(false);

  // => Holds the lockedUntil timestamp while the account is locked out
  // => null means not locked, drives the persistent countdown banner below
  const [lockedUntil, setLockedUntil] = useState(null);

  // => Live mm:ss countdown text shown inside the lockout banner
  const [countdown, setCountdown] = useState('');

  // => Ticks every second while locked out, purely cosmetic
  // => Real enforcement always happens server-side on the next actual submit
  useEffect(() => {
    if (!lockedUntil) return;

    const tick = () => {
      const remainingMs = new Date(lockedUntil).getTime() - Date.now();

      if (remainingMs <= 0) {
        setLockedUntil(null);
        setCountdown('');
        return;
      }

      const totalSeconds = Math.ceil(remainingMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      setCountdown(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  // => Toggles the password field between hidden and visible
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

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
      const data = err.response?.data;

      // => 429 with a lockedUntil timestamp means the account just got
      // => locked or is still inside an active lockout window
      // => Shown as a persistent banner instead of a toast since it needs
      // => to stay visible for the full countdown, a toast auto-dismisses
      if (err.response?.status === 429 && data?.lockedUntil) {
        setLockedUntil(data.lockedUntil);
      } else {
        toast.error(data?.message || 'Something went wrong. Please try again.');
      }
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
            <div className="input-wrap password-input-wrap">
              <img src={lockIcon} alt="" className="input-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Enter your password"
                required
              />
              {/* => Clicking toggles input type between text and password */}
              {/* => type="button" prevents this from submitting the form */}
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <img
                  src={showPassword ? eyeOffIcon : eyeIcon}
                  alt=""
                  className="password-toggle-icon"
                />
              </button>
            </div>
          </div>
          <div className="login-forgot">
            <a href="#">
              Forgot password?
            </a>
          </div>

          {/* => Persistent lockout banner, stays visible for the full countdown */}
          {lockedUntil && (
            <div className="login-locked-banner">
              Too many requests. Please wait before trying again.
              <span className="login-locked-countdown">{countdown}</span>
            </div>
          )}

          <button
            type="submit"
            className="login-btn"
            disabled={isLoading || !!lockedUntil}
          >
            {isLoading ? 'Signing in...' : lockedUntil ? 'Locked' : 'Sign In'}
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