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
import Payments      from './pages/Payments/payments.jsx';
import Courses       from './pages/Courses/Courses.jsx';
import Pages         from './pages/Pages/Pages.jsx';
import Logs          from './pages/Logs/Logs.jsx';
import Chatbots      from './pages/Chatbots/Chatbots.jsx';
import Admins        from './pages/Admins/Admins.jsx';
import Account from './pages/Account/account.jsx';

// components 
// import EnrollmentDetail from './components/EnrollmentDetail/EnrollmentDetail.jsx';
import TESDAEnrollmentDetail from './components/TESDAEnrollmentDetail/tesdaEnrollmentDetail.jsx';
import SHSEnrollmentDetail   from './components/SHSEnrollmentDetail/shsEnrollmentDetail.jsx';
import TesdaBatchDetail from './components/Classes/TesdaBatchDetail/TesdaBatchDetail.jsx';
import ShsBatchDetail   from './components/Classes/ShsBatchDetail/ShsBatchDetail.jsx';
import StudentDetail from './components/StudentDetail/StudentDetail.jsx';
import TesdaCourseDetail from './components/TESDACourseDetail/TesdaCourseDetail.jsx';
import ShsCourseDetail   from './components/ShsCourseDetail/ShsCourseDetail.jsx';
import FacilityDetail    from './components/Classes/FacilityDetail/FacilityDetail.jsx';
import FacilitySessionCalendar from './components/Classes/FacilitySessionCalendar/facilitySessionCalendar.jsx';
import TrainerDetail  from './components/Classes/TrainerDetail/trainerDetail.jsx';
import PaymentDetail  from './components/Payments/PaymentDetail/paymentDetail.jsx';

import RefundDetail   from './components/Payments/RefundDetail/refundDetail.jsx';

import { Toaster } from "react-hot-toast";


import './App.css';

function App() {
    return (
        <div>

        <Toaster /> 
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

                    <Route path="classes"                 element={<Classes />} />
                    <Route path="classes/tesda/:publicId" element={<TesdaBatchDetail />} />
                    <Route path="classes/shs/:publicId"   element={<ShsBatchDetail />} />
                    <Route path="classes/sessions/:facilityPublicId" element={<FacilitySessionCalendar />} />
                    <Route path="facilities/:publicId"  element={<FacilityDetail />} />
                    <Route path="trainers/:publicId" element={<TrainerDetail />} />

                    <Route path="support-tickets"       element={<SupportTickets />} />

                    <Route path="students"              element={<Students />} />
                    <Route path="students/:publicId"    element={<StudentDetail />} />
                    
                    <Route path="reports"               element={<Reports />} />
                    <Route path="payments"              element={<Payments />} />
                    <Route path="payments/:publicId"    element={<PaymentDetail />} />
                    <Route path="refunds/:publicId"     element={<RefundDetail />} />
                    <Route path="courses"               element={<Courses />} />
                    <Route path="courses/tesda/:adminUuid" element={<TesdaCourseDetail />} />
                    <Route path="courses/shs/:adminUuid"   element={<ShsCourseDetail />} />
                    <Route path="pages"                 element={<Pages />} />
                    <Route path="logs"                  element={<Logs />} />
                    <Route path="chatbots"              element={<Chatbots />} />
                    <Route path="admins"                element={<Admins />} />
                    <Route path="account" element={<Account />} />
                </Route>
                
            </Routes>
            
        </BrowserRouter>
        </div>

        
    );
}

export default App;