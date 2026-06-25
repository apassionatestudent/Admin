// => admin/frontend/src/api/axiosAdmin.js
// => Central axios instance for all admin API requests
// => Automatically attaches the CSRF token and admin_token cookie to every request

import axios from 'axios';

const axiosAdmin = axios.create({
  // => withCredentials ensures the admin_token cookie is sent on every request
  // => without this, the browser strips cookies from cross-origin requests
  withCredentials: true,
});

// => Request interceptor: runs before every outgoing request
// => Reads the CSRF token from sessionStorage and attaches it as a header
// => sessionStorage is tab-scoped - cleared when the browser tab closes
axiosAdmin.interceptors.request.use((config) => {
  const csrfToken = sessionStorage.getItem('csrfToken');
  if (csrfToken) {
    config.headers['x-csrf-token'] = csrfToken;
  }
  return config;
});

// => Response interceptor: handles session expiry globally
// => If any request returns 401, the CSRF token and session flags are cleared
// => and the admin is redirected to login
axiosAdmin.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // => Clear session data on auth failure
      sessionStorage.removeItem('csrfToken');
      sessionStorage.removeItem('isAdminLoggedIn');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default axiosAdmin;