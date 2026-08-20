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
import Pages         from './pages/Pages/pages.jsx';
import Logs          from './pages/Logs/Logs.jsx';
import Chatbots      from './pages/Chatbots/chatbots.jsx';
import Staff          from './pages/Staff/staff.jsx';
import Account from './pages/Account/account.jsx';
import SetAdminPassword from './pages/SetAdminPassword/setAdminPassword.jsx';

// components 
// import EnrollmentDetail from './components/EnrollmentDetail/EnrollmentDetail.jsx';
import TESDAEnrollmentDetail from './components/Enrollments/TESDAEnrollmentDetail/tesdaEnrollmentDetail.jsx';
import SHSEnrollmentDetail   from './components/Enrollments/SHSEnrollmentDetail/shsEnrollmentDetail.jsx';
import TesdaBatchDetail from './components/Classes/TesdaBatchDetail/TesdaBatchDetail.jsx';
import ShsBatchDetail   from './components/Classes/ShsBatchDetail/ShsBatchDetail.jsx';
import StudentDetail from './components/StudentDetail/StudentDetail.jsx';
import TesdaCourseDetail from './components/Courses/TesdaCourseDetail/TesdaCourseDetail.jsx';
import ShsCourseDetail   from './components/Courses/ShsCourseDetail/ShsCourseDetail.jsx';
import FacilityDetail    from './components/Classes/FacilityDetail/FacilityDetail.jsx';
import FacilitySessionCalendar from './components/Classes/FacilitySessionCalendar/facilitySessionCalendar.jsx';
import TrainerDetail  from './components/Classes/TrainerDetail/trainerDetail.jsx';
import PaymentDetail  from './components/Payments/PaymentDetail/paymentDetail.jsx';

import RefundDetail   from './components/Payments/RefundDetail/refundDetail.jsx';
import StaffDetail    from './components/Staff/StaffDetail/staffDetail.jsx';
import ChatbotDetail  from './components/Chatbots/ChatbotDetail/chatbotDetail.jsx';

import PublicSupportTicketDetail from './components/SupportTickets/PublicSupportTicketDetail/publicSupportTicketDetail.jsx';
import StudentSupportTicketDetail from './components/SupportTickets/StudentSupportTicketDetail/studentSupportTicketDetail.jsx';

// => Route guard: redirects to /dashboard if the logged-in admin isn't granted this section
import RequireSection from './components/RequireSection/requireSection.jsx';

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

                {/* => Public route: newly invited admins land here to set their password */}
                <Route path="/set-password/:token" element={<SetAdminPassword />} />

                {/* => Protected layout route: Dashboard wraps all admin sub-pages */}
                {/* => Session verification happens inside Dashboard.jsx */}
                <Route path="/dashboard" element={<Dashboard />}>

                    {/* => index renders DashboardHome at /dashboard exactly */}
                    <Route index element={<DashboardHome />} />

                    {/* => Sub-routes render inside the <Outlet /> in Dashboard.jsx */}
                    <Route path="enrollments" element={<RequireSection section="enrollments"><Enrollments /></RequireSection>} />
                    {/* <Route path="enrollments/:publicId" element={<EnrollmentDetail />} /> */}
                    <Route path="enrollments/tesda/:publicId" element={<RequireSection section="enrollments"><TESDAEnrollmentDetail /></RequireSection>} />
                    <Route path="enrollments/shs/:publicId" element={<RequireSection section="enrollments"><SHSEnrollmentDetail /></RequireSection>} />  

                    <Route path="classes" element={<RequireSection section="classes"><Classes /></RequireSection>} />
                    <Route path="classes/tesda/:publicId" element={<RequireSection section="classes"><TesdaBatchDetail /></RequireSection>} />
                    <Route path="classes/shs/:publicId" element={<RequireSection section="classes"><ShsBatchDetail /></RequireSection>} />
                    <Route path="classes/sessions/:facilityPublicId" element={<RequireSection section="classes"><FacilitySessionCalendar /></RequireSection>} />
                    <Route path="classes/facilities/:publicId" element={<RequireSection section="classes"><FacilityDetail /></RequireSection>} />
                    <Route path="classes/trainers/:publicId" element={<RequireSection section="classes"><TrainerDetail /></RequireSection>} />

                    <Route path="support-tickets" element={<RequireSection section="support-tickets"><SupportTickets /></RequireSection>} />
                    <Route path="support-tickets/:publicId" element={<RequireSection section="support-tickets"><PublicSupportTicketDetail /></RequireSection>} />
                    <Route path="support-tickets/students/:publicId" element={<RequireSection section="support-tickets"><StudentSupportTicketDetail /></RequireSection>} />

                    <Route path="students" element={<RequireSection section="students"><Students /></RequireSection>} />
                    <Route path="students/:publicId" element={<RequireSection section="students"><StudentDetail /></RequireSection>} />
                    
                    <Route path="reports" element={<RequireSection section="reports"><Reports /></RequireSection>} />
                    <Route path="payments" element={<RequireSection section="payments"><Payments /></RequireSection>} />
                    <Route path="payments/:publicId" element={<RequireSection section="payments"><PaymentDetail /></RequireSection>} />
                    <Route path="refunds/:publicId" element={<RequireSection section="payments"><RefundDetail /></RequireSection>} />
                    <Route path="courses" element={<RequireSection section="courses"><Courses /></RequireSection>} />
                    <Route path="courses/tesda/:adminUuid" element={<RequireSection section="courses"><TesdaCourseDetail /></RequireSection>} />
                    <Route path="courses/shs/:adminUuid" element={<RequireSection section="courses"><ShsCourseDetail /></RequireSection>} />
                    <Route path="pages" element={<RequireSection section="pages"><Pages /></RequireSection>} />
                    <Route path="logs" element={<RequireSection section="logs"><Logs /></RequireSection>} />
                    <Route path="chatbots" element={<RequireSection section="chatbots"><Chatbots /></RequireSection>} />
                    <Route path="chatbots/:publicId" element={<RequireSection section="chatbots"><ChatbotDetail /></RequireSection>} />
                    <Route path="staff" element={<RequireSection section="staff"><Staff /></RequireSection>} />
                    <Route path="staff/:publicId" element={<RequireSection section="staff"><StaffDetail /></RequireSection>} />
                    <Route path="account" element={<Account />} />
                </Route>
                
            </Routes>
            
        </BrowserRouter>
        </div>

        
    );
}

export default App;