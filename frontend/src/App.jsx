import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// pages
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

// components 
// import EnrollmentDetail from './components/EnrollmentDetail/EnrollmentDetail.jsx';
import TESDAEnrollmentDetail from './components/TESDAEnrollmentDetail/tesdaEnrollmentDetail.jsx';
import SHSEnrollmentDetail   from './components/SHSEnrollmentDetail/shsEnrollmentDetail.jsx';
import ClassDetail from './components/ClassDetail/ClassDetail.jsx';
import StudentDetail from './components/StudentDetail/StudentDetail.jsx';

import { Toaster } from "react-hot-toast";


import './App.css';

function App() {
    return (
        <div>

        {/* <Toaster />  */}
        {/* // => BrowserRouter provides the routing context required by useNavigate, useLocation, etc. */}
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
                    <Route path="enrollments"           element={<Enrollments />} />
                    {/* <Route path="enrollments/:publicId" element={<EnrollmentDetail />} /> */}
                    <Route path="enrollments/tesda/:publicId" element={<TESDAEnrollmentDetail />} />
                    <Route path="enrollments/shs/:publicId"   element={<SHSEnrollmentDetail />} />  

                    <Route path="classes"               element={<Classes />} />
                    <Route path="classes/:publicId"     element={<ClassDetail />} />

                    <Route path="support-tickets"       element={<SupportTickets />} />

                    <Route path="students"              element={<Students />} />
                    <Route path="students/:publicId"    element={<StudentDetail />} />
                    
                    <Route path="reports"               element={<Reports />} />
                    <Route path="payments"              element={<Payments />} />
                    <Route path="courses"               element={<Courses />} />
                    <Route path="pages"                 element={<Pages />} />
                    <Route path="logs"                  element={<Logs />} />
                    <Route path="chatbots"              element={<Chatbots />} />
                    <Route path="admins"                element={<Admins />} />
                </Route>
                
            </Routes>
            
        </BrowserRouter>
        </div>

        
    );
}

export default App;