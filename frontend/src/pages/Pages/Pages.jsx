// => pages/Pages/pages.jsx
// => Top-level Pages screen - shared header (title + subtitle + the active
//    tab's primary action button) sits above the tab bar, same shape as
//    Courses.jsx's "Courses | TESDA" header + "+ Add Sector"/"+ Add Course"
//    actions. Each tab keeps owning its own data/modal state - the header
//    buttons reach into it through a ref (openAddModal / save / etc).

import React, { useRef, useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import './pages.css';

import StudentDashboardAnnouncementsWYSIWYG from '../../components/Pages/StudentDashboardAnnouncementsWYSIWYG/studentDashboardAnnouncementsWYSIWYG.jsx';
import PrivacyPolicyWYSIWYG from '../../components/Pages/PrivacyPolicyWYSIWYG/privacyPolicyWYSIWYG.jsx';
import FAQsWYSIWYG from '../../components/Pages/FAQsWYSIWYG/faqsWYSIWYG.jsx';

// => Tab metadata - label feeds the "Pages | <Tab>" title (mirrors
//    Classes.jsx's "Classes | {tabMeta[mainTab].label}"), subtitle feeds
//    the line underneath it. Same convention as Classes.jsx's tabMeta.
const tabMeta = {
  announcements: {
    label: 'Announcements',
    subtitle: "General announcements shown on every student's dashboard home page.",
  },
  privacyPolicy: {
    label: 'Privacy Policy',
    subtitle: 'This content shows on the public Privacy Policy page.',
  },
  faqs: {
    label: 'FAQs',
    subtitle: "Shown on the public FAQ page and referenced by the AI chatbot's escalation flow.",
  },
};

export default function Pages() {
  const navigate = useNavigate();
  const { admin } = useOutletContext();

  // => Belt-and-suspenders redirect - the backend already returns 403 on
  // => every request below via requireSection('pages'), but without this
  // => the page still renders its full shell and only shows fetch errors
  // => instead of bouncing back to Dashboard
  useEffect(() => {
    if (admin && admin.role !== 'super_admin' && !admin.sections?.includes('pages')) {
      navigate('/dashboard');
    }
  }, [admin, navigate]);

  const [mainTab, setMainTab] = useState('announcements');

  // => Active/Inactive filter for the Announcements tab only - no
  //    "Deleted" option since Announcements/FAQs use hard delete, not the
  //    soft-delete + restore pattern Facilities/Trainers/Courses use
  const [announcementViewMode, setAnnouncementViewMode] = useState('active'); // => 'active' | 'inactive'

  // => Refs let the shared header's action button reach into whichever
  //    tab component is currently mounted, without lifting each tab's
  //    entire data/modal state up into this file
  const announcementsRef = useRef(null);
  const privacyRef = useRef(null);
  const faqsRef = useRef(null);

  const [savingPrivacy, setSavingPrivacy] = useState(false);

  const handleSavePrivacyPolicy = async () => {
    if (!privacyRef.current) return;
    setSavingPrivacy(true);
    try {
        await privacyRef.current.save();
    } finally {
        setSavingPrivacy(false);
    }
    };

  return (
    <div className="adm-pages-page">

      {/* ════════════════════════════════════
          PAGE HEADER
          => Title/subtitle swap per tab, action button on the right swaps
             per tab too - same shape as Courses.jsx's header
          ════════════════════════════════════ */}
      <div className="adm-pages-header">
        <div>
          <h1 className="adm-pages-title">Pages | {tabMeta[mainTab].label}</h1>
          <p className="adm-pages-subtitle">{tabMeta[mainTab].subtitle}</p>
        </div>

        <div className="adm-pages-header-actions">
          {mainTab === 'announcements' && (
            <button
              className="adm-pages-btn-solid"
              onClick={() => announcementsRef.current?.openAddModal()}
            >
              + Add Announcement
            </button>
          )}
          {mainTab === 'privacyPolicy' && (
            <button
              className="adm-pages-btn-solid"
              onClick={handleSavePrivacyPolicy}
              disabled={savingPrivacy}
            >
              {savingPrivacy ? 'Saving…' : 'Save Changes'}
            </button>
          )}
          {mainTab === 'faqs' && (
            <button
              className="adm-pages-btn-outline"
              onClick={() => faqsRef.current?.openAddSectionModal()}
            >
              + Add Section
            </button>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════
          TABS ROW
          => Active/Inactive toggle only shows for the Announcements tab,
             positioned on the right of the same row - mirrors Classes.jsx's
             "mainTab === 'facilities'" conditional view-toggle placement
          ════════════════════════════════════ */}
      <div className="adm-main-tabs-row">
        <div className="adm-main-tabs">
          {Object.entries(tabMeta).map(([key, meta]) => (
            <button
              key={key}
              className={`adm-main-tab-btn ${mainTab === key ? 'adm-main-tab-btn--active' : ''}`}
              onClick={() => setMainTab(key)}
            >
              {meta.label}
            </button>
          ))}
        </div>

        {mainTab === 'announcements' && (
          <div className="view-toggle">
            <button
              className={announcementViewMode === 'active' ? 'view-toggle-btn view-toggle-active' : 'view-toggle-btn'}
              onClick={() => setAnnouncementViewMode('active')}
            >
              Active
            </button>
            <button
              className={announcementViewMode === 'inactive' ? 'view-toggle-btn view-toggle-active' : 'view-toggle-btn'}
              onClick={() => setAnnouncementViewMode('inactive')}
            >
              Inactive
            </button>
          </div>
        )}
      </div>

      <div className="adm-pages-body">
        {mainTab === 'announcements' && (
          <StudentDashboardAnnouncementsWYSIWYG ref={announcementsRef} viewMode={announcementViewMode} />
        )}
        {mainTab === 'privacyPolicy' && (
          <PrivacyPolicyWYSIWYG ref={privacyRef} />
        )}
        {mainTab === 'faqs' && (
          <FAQsWYSIWYG ref={faqsRef} />
        )}
      </div>

    </div>
  );
}