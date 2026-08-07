import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import axios from "axios";
import "./SideBar.css";

// => Placeholder icons - swap these out with your actual admin icon assets later
import DashboardIcon   from "../../assets/icons/dashboard.png";
import EnrollmentIcon  from "../../assets/icons/enrollments.png";
import ClassesIcon     from "../../assets/icons/classes.png";
import SupportIcon     from "../../assets/icons/support.png";
import StudentsIcon    from "../../assets/icons/students.png";
import ReportsIcon     from "../../assets/icons/reports.png";
import PaymentsIcon    from "../../assets/icons/payments.png";
import CoursesIcon     from "../../assets/icons/courses.png";
import PagesIcon       from "../../assets/icons/pages.png";
import LogsIcon        from "../../assets/icons/logs.png";
import ChatbotsIcon    from "../../assets/icons/chatbots.png";
import AdminsIcon      from "../../assets/icons/admins.png";
import LogoutIcon      from "../../assets/icons/logout.png";
import DefaultAvatar   from "../../assets/icons/default-avatar.png";
import AccountIcon    from "../../assets/icons/account.png";

const NAV_ITEMS = [
  { id: "dashboard",       label: "Dashboard",       icon: DashboardIcon,  to: "/dashboard" },
  { id: "enrollments",     label: "Enrollments",     icon: EnrollmentIcon, to: "/dashboard/enrollments" },
  { id: "classes",         label: "Classes",         icon: ClassesIcon,    to: "/dashboard/classes" },
  { id: "support-tickets", label: "Support Tickets", icon: SupportIcon,    to: "/dashboard/support-tickets" },
  { id: "students",        label: "Students",        icon: StudentsIcon,   to: "/dashboard/students" },
  { id: "reports",         label: "Reports",         icon: ReportsIcon,    to: "/dashboard/reports" },
  { id: "payments",        label: "Payments",        icon: PaymentsIcon,   to: "/dashboard/payments" },
  { id: "courses",         label: "Courses",         icon: CoursesIcon,    to: "/dashboard/courses" },
  { id: "pages",           label: "Pages",           icon: PagesIcon,      to: "/dashboard/pages" },
  { id: "logs",            label: "Logs",            icon: LogsIcon,       to: "/dashboard/logs" },
  { id: "chatbots",        label: "Chatbots",        icon: ChatbotsIcon,   to: "/dashboard/chatbots" },
  { id: "admins",          label: "Staff",           icon: AdminsIcon,     to: "/dashboard/staff" },
  { id: "account",         label: "Account",         icon: AccountIcon,    to: "/dashboard/account" },
];

// => Nav items every logged-in admin can always reach, regardless of
// => their granted sections - not part of admin_section_permissions
const ALWAYS_VISIBLE_IDS = ["dashboard", "account"];

const Sidebar = ({
  adminName = "Admin Name",
  adminRole = "admin",
  adminSections = [],
}) => {
  const [hoveredItem, setHoveredItem] = useState(null);
  const navigate = useNavigate();

  // => Staff (id: "admins") is super_admin only. Dashboard/Account are always visible.
  // => Everything else is filtered by the admin's granted sections.
  // => This is a UX convenience only; the real boundary is requireSection /
  // => requireSuperAdmin enforced on the backend.
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.id === "admins") return adminRole === "super_admin";
    if (ALWAYS_VISIBLE_IDS.includes(item.id)) return true;
    if (adminRole === "super_admin") return true;
    return adminSections.includes(item.id);
  });

  // => Formats role for display: 'super_admin' => 'Super Admin', 'staff' => 'Staff'
  const formatRole = (role) => {
    return role
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // => Clears the session flag, calls the backend to clear the admin_token cookie,
  // => then redirects to the login page
  const handleLogout = async () => {
    try {
      await axios.post(
        '/api/admin-auth/logout',
        {},
        { withCredentials: true } // => required so the backend can clear the httpOnly cookie
      );
    } catch (error) {
      // => Even if the backend call fails, still clear the frontend state
      console.error('Logout error:', error);
    } finally {
      sessionStorage.removeItem('isAdminLoggedIn');
      navigate('/');
    }
  };

  const navLinkClass = (id) => ({ isActive }) =>
    [
      "sidebar-nav-item",
      isActive ? "sidebar-nav-item--active" : "",
      hoveredItem === id ? "sidebar-nav-item--hovered" : "",
    ].join(" ").trim();

  return (
    <aside className="sidebar">
      {/* => Admin identity section at the top */}
      <div className="sidebar-profile">
        <div className="sidebar-avatar-ring">
          <img
            src={DefaultAvatar}
            alt={`${adminName}'s avatar`}
            className="sidebar-avatar"
          />
        </div>
        <p className="sidebar-profile-name">{adminName}</p>
        {/* => Shows the admin's role below their name */}
        <span className="sidebar-profile-role">{formatRole(adminRole)}</span>
      </div>

      <div className="sidebar-divider" />

      <nav className="sidebar-nav" aria-label="Admin navigation">
        <ul className="sidebar-nav-list">
          {visibleNavItems.map(({ id, label, icon, to }) => (
            <li key={id}>
              <NavLink
                to={to}
                className={navLinkClass(id)}
                onClick={() => {}}
                onMouseEnter={() => setHoveredItem(id)}
                onMouseLeave={() => setHoveredItem(null)}
                end={to === "/dashboard"} // => 'end' only on dashboard so it doesn't stay active on sub-routes
              >
                <img src={icon} alt={`${label} icon`} className="sidebar-nav-icon" />
                <span className="sidebar-nav-label">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar-spacer" />

      <div className="sidebar-logout-wrapper">
        <div className="sidebar-divider" />
        <button
          className="sidebar-nav-item sidebar-nav-item--logout"
          onClick={handleLogout}
        >
          <img src={LogoutIcon} alt="Logout icon" className="sidebar-nav-icon" />
          <span className="sidebar-nav-label">Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;