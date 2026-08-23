// => Theme context for the Admin Dashboard.
// => Every admin is logged in whenever this matters, so unlike the student
// => dashboard's ThemeContext.jsx, there is no guest/localStorage branch here.
// => Persistence rule: admins.is_night_mode via GET/PATCH /api/admin/account(/theme)

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import axiosAdmin from "../utils/axiosAdmin.js";

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  // => Defaults to light on first paint, DB value overrides it once the
  // => fetch below resolves, no time-based guess needed since there is no
  // => guest state to fall back on for admin
  const [isDark, setIsDark] = useState(false);
  const location = useLocation();

  // => Only fetch once, and only once the admin is actually on a dashboard
  // => route, so this never fires against the public Login or
  // => SetAdminPassword routes before a session exists
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    const onDashboard = location.pathname.startsWith("/dashboard");
    if (onDashboard && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      axiosAdmin
        .get("/api/admin/account")
        .then((res) => {
          const dbValue = res.data?.account?.is_night_mode;
          // => Only trust the DB value if it actually came back as a boolean
          if (typeof dbValue === "boolean") {
            setIsDark(dbValue);
          }
        })
        .catch((err) => {
          // => Swallowed here on purpose - Dashboard.jsx's own session
          // => verification already handles redirecting an unauthenticated
          // => admin, this context shouldn't duplicate that logic
          console.error("Failed to fetch saved theme preference:", err);
        });
    }
  }, [location.pathname]);

  const toggleTheme = () => {
    // => Instant UI feedback first, network call is fire-and-forget after,
    // => same order as the student dashboard's ThemeContext.jsx
    const next = !isDark;
    setIsDark(next);

    axiosAdmin
      .patch("/api/admin/account/theme", { is_night_mode: next })
      .catch((err) => console.error("Failed to save theme preference:", err));
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
