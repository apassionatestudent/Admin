import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Login         from './pages/Login/Login.jsx';
import Dashboard     from './pages/Dashboard/Dashboard.jsx';
import DashboardHome from './pages/Dashboard/DashboardHome.jsx';
import Enrollments   from './pages/Enrollments/Enrollments.jsx';
import Classes       from './pages/Classes/Classes.jsx';
import SupportTickets from './pages/SupportTickets/SupportTickets.jsx';
import Students      from './pages/Students/Students.jsx';
import Reports       from './pages/Reports/Reports.jsx';
import Payments      from './pages/Payments/Payments.jsx';
import Courses       from './pages/Courses/Courses.jsx';
import Pages         from './pages/Pages/Pages.jsx';
import Logs          from './pages/Logs/Logs.jsx';
import Chatbots      from './pages/Chatbots/Chatbots.jsx';
import Admins        from './pages/Admins/Admins.jsx';

import './App.css';

function App() {
    return (
        // => BrowserRouter provides the routing context required by useNavigate, useLocation, etc.
        <BrowserRouter>
            <Routes>
                {/* => Public route: login page */}
                <Route path="/" element={<Login />} />

                {/* => Protected layout route: Dashboard wraps all admin sub-pages */}
                {/* => Session verification happens inside Dashboard.jsx */}
                <Route path="/dashboard" element={<Dashboard />}>

                    {/* => index renders DashboardHome at /dashboard exactly */}
                    <Route index element={<DashboardHome />} />

                    {/* => Sub-routes render inside the <Outlet /> in Dashboard.jsx */}
                    <Route path="enrollments"    element={<Enrollments />} />
                    <Route path="classes"        element={<Classes />} />
                    <Route path="support-tickets" element={<SupportTickets />} />
                    <Route path="students"       element={<Students />} />
                    <Route path="reports"        element={<Reports />} />
                    <Route path="payments"       element={<Payments />} />
                    <Route path="courses"        element={<Courses />} />
                    <Route path="pages"          element={<Pages />} />
                    <Route path="logs"           element={<Logs />} />
                    <Route path="chatbots"       element={<Chatbots />} />
                    <Route path="admins"         element={<Admins />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}

export default App;