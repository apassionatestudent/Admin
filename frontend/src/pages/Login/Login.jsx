import './Login.css';
import logo from './../../assets/logo.jpg';

import emailIcon from './../../assets/email.png';
import lockIcon from './../../assets/lock.png';


export default function Login() {
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
        <form className="login-form">
          <div className="form-group">
            <label>Email Address</label>
            {/* => input-wrap + input-icon adds the mail icon inside the field */}
            <div className="input-wrap">
              <img src={emailIcon} alt="" className="input-icon" />
              <input
                type="email"
                placeholder="Enter your email"
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
                placeholder="Enter your password"
              />
            </div>
          </div>
          <div className="login-forgot">
            <a href="#">
              Forgot password?
            </a>
          </div>
          <button
            type="submit"
            className="login-btn"
          >
            Sign In
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