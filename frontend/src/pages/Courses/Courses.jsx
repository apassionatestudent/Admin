import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosAdmin from '../../utils/axiosAdmin.js';
import CreateTesdaCourseModal from '../../components/Courses/CreateTesdaCourseModal/CreateTesdaCourseModal.jsx';
import CreateShsCourseModal from '../../components/Courses/CreateShsCourseModal/CreateShsCourseModal.jsx';
import AddClusterModal from '../../components/Courses/AddClusterModal/AddClusterModal.jsx';
import AddSectorModal from '../../components/Courses/AddSectorModal/AddSectorModal.jsx';
import ConfirmModal from '../../components/ConfirmModal/ConfirmModal.jsx';
// => Toast for restore-blocked feedback (sector/cluster still deleted)
import toast from 'react-hot-toast';
// => Shared spinner/error block, replaces the local courses-state markup below
import LoadingState from '../../components/LoadingState/loadingState.jsx';
import './Courses.css';

export default function Courses() {
  const [activeTab, setActiveTab] = useState('tesda'); // => 'tesda' | 'shs'
  const [viewMode, setViewMode] = useState('active'); // => 'active' | 'deleted'
  const [tesdaCourses, setTesdaCourses] = useState([]);
  const [shsCourses, setShsCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  // => Separate from "empty" on purpose - a failed fetch and a genuinely
  // => empty course list need different messages, not the same blank/vague one
  const [fetchError, setFetchError] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAddClusterModalOpen, setIsAddClusterModalOpen] = useState(false);
  const [isAddSectorModalOpen, setIsAddSectorModalOpen] = useState(false);

  // => Client-side only, mirrors Classes.jsx's Trainers tab pattern - never
  //    triggers a re-fetch, just re-filters whatever's already loaded in
  //    tesdaCourses/shsCourses. Kept separate per tab so switching tabs
  //    doesn't wipe out or mix up the other tab's search/filter state.
  const [tesdaSearchTerm, setTesdaSearchTerm] = useState('');
  const [tesdaSectorFilter, setTesdaSectorFilter] = useState('ALL');
  const [tesdaNcLevelFilter, setTesdaNcLevelFilter] = useState('ALL');
  const [tesdaStatusFilter, setTesdaStatusFilter] = useState('ALL');

  const [shsSearchTerm, setShsSearchTerm] = useState('');
  const [shsClusterFilter, setShsClusterFilter] = useState('ALL');
  const [shsGradeLevelFilter, setShsGradeLevelFilter] = useState('ALL');
  const [shsStatusFilter, setShsStatusFilter] = useState('ALL');

  const navigate = useNavigate();

  // => One shared ConfirmModal instance, used for restoring a deleted course
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null });
  const openConfirm = (message, onConfirm) => setConfirmModal({ isOpen: true, message, onConfirm });
  const closeConfirm = () => setConfirmModal({ isOpen: false, message: '', onConfirm: null });
  const handleConfirmYes = () => {
    const action = confirmModal.onConfirm;
    closeConfirm();
    if (action) action();
  };

  useEffect(() => {
    fetchCourses();
  }, [viewMode]);

  const fetchCourses = async () => {
    setLoading(true);
    setFetchError('');
    try {
      // => Same two endpoints either way - just swap to the /deleted variant
      // => when viewing the Deleted tab
      const tesdaPath = viewMode === 'deleted' ? '/api/admin/tesda-courses/deleted' : '/api/admin/tesda-courses';
      const shsPath = viewMode === 'deleted' ? '/api/admin/shs-courses/deleted' : '/api/admin/shs-courses';
      const [tesdaRes, shsRes] = await Promise.all([
        axiosAdmin.get(tesdaPath),
        axiosAdmin.get(shsPath),
      ]);
      setTesdaCourses(tesdaRes.data.data);
      setShsCourses(shsRes.data.data);
    } catch (error) {
      console.error('Failed to fetch courses:', error);
      setFetchError('Failed to load courses. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // => Fired by either Create modal on success - refetches so the new course
  // => shows up immediately without a full page reload
  const handleCourseCreated = () => {
    setIsCreateModalOpen(false);
    fetchCourses();
  };

  const handleRestore = (course) => {
    openConfirm(`Restore "${course.title}"? It will reappear in the active course list.`, async () => {
      try {
        const path =
          activeTab === 'tesda'
            ? `/api/admin/tesda-courses/${course.admin_uuid}/restore`
            : `/api/admin/shs-courses/${course.admin_uuid}/restore`;
        await axiosAdmin.post(path);
        fetchCourses();
      } catch (error) {
        console.error('Failed to restore course:', error);
        // => 409 here means the backend guard caught a deleted sector/cluster -
        // => surface that exact message instead of a generic failure toast
        toast.error(error.response?.data?.message || 'Failed to restore course.');
      }
    });
  };

  const isDeletedView = viewMode === 'deleted';
  const activeList = activeTab === 'tesda' ? tesdaCourses : shsCourses;
  const colSpan = activeTab === 'tesda' ? 6 : 4;

  // => Dropdown options built from whatever's already loaded - no separate
  //    endpoint needed, and they stay automatically in sync with real data
  const tesdaSectorOptions = [...new Set(tesdaCourses.map((c) => c.sector_name).filter(Boolean))];
  const tesdaNcLevelOptions = [...new Set(tesdaCourses.map((c) => c.certification_type).filter(Boolean))];
  const shsClusterOptions = [...new Set(shsCourses.map((c) => c.cluster_name).filter(Boolean))];
  const shsGradeLevelOptions = [...new Set(shsCourses.map((c) => c.grade_level).filter(Boolean))];

  // => Same in-memory filtering pattern as Classes.jsx's applyTrainerFilters -
  //    combines dropdowns + free-text search into one pass, never re-fetches
  const applyTesdaFilters = (rows) =>
    rows.filter((c) => {
      const matchesSector = tesdaSectorFilter === 'ALL' || c.sector_name === tesdaSectorFilter;
      const matchesNcLevel = tesdaNcLevelFilter === 'ALL' || c.certification_type === tesdaNcLevelFilter;
      const matchesStatus = tesdaStatusFilter === 'ALL' || c.status?.toLowerCase() === tesdaStatusFilter;

      const term = tesdaSearchTerm.trim().toLowerCase();
      const matchesSearch =
        !term ||
        c.title?.toLowerCase().includes(term) ||
        c.accreditation_no?.toLowerCase().includes(term);

      return matchesSector && matchesNcLevel && matchesStatus && matchesSearch;
    });

  const applyShsFilters = (rows) =>
    rows.filter((c) => {
      const matchesCluster = shsClusterFilter === 'ALL' || c.cluster_name === shsClusterFilter;
      const matchesGradeLevel = shsGradeLevelFilter === 'ALL' || c.grade_level === shsGradeLevelFilter;
      const matchesStatus = shsStatusFilter === 'ALL' || c.status?.toLowerCase() === shsStatusFilter;

      const term = shsSearchTerm.trim().toLowerCase();
      const matchesSearch = !term || c.title?.toLowerCase().includes(term);

      return matchesCluster && matchesGradeLevel && matchesStatus && matchesSearch;
    });

  // => The list actually rendered in the table - activeList itself stays
  //    untouched so we can still tell "genuinely empty" apart from
  //    "empty because of the current filter" in the empty-state message below
  const filteredList = activeTab === 'tesda' ? applyTesdaFilters(tesdaCourses) : applyShsFilters(shsCourses);

  return (
    <main className="courses-page">
      <div className="courses-header">
        <div>
          {/* => Title now reads "Courses | TESDA" or "Courses | SHS" -
                 mirrors Classes.jsx's "Classes | {tabMeta[mainTab].label}" pattern */}
          <h2>Courses | {activeTab === 'tesda' ? 'TESDA' : 'SHS'}</h2>
          {/* => matches Enrollments.jsx's subtitle pattern under adm-enroll-title */}
          <p className="courses-subtitle">
            Showing <strong>{tesdaCourses.length}</strong> TESDA and <strong>{shsCourses.length}</strong> SHS course
            {(tesdaCourses.length + shsCourses.length) !== 1 ? 's' : ''}
            {isDeletedView ? ' (deleted)' : ''}.
          </p>
        </div>
        <div className="courses-header-actions">
          {!isDeletedView && activeTab === 'tesda' && (
            <button className="btn-outline-action" onClick={() => setIsAddSectorModalOpen(true)}>
              + Manage Sectors
            </button>
          )}
          {!isDeletedView && activeTab === 'shs' && (
            <button className="btn-outline-action" onClick={() => setIsAddClusterModalOpen(true)}>
              + Manage Clusters
            </button>
          )}
          {!isDeletedView && (
            <button className="btn-create-course" onClick={() => setIsCreateModalOpen(true)}>
              + Add Course
            </button>
          )}
        </div>
      </div>

      <div className="courses-tabs-row">
        <div className="courses-tabs">
          <button
            className={activeTab === 'tesda' ? 'tab-btn tab-active' : 'tab-btn'}
            onClick={() => setActiveTab('tesda')}
          >
            TESDA Courses
          </button>
          <button
            className={activeTab === 'shs' ? 'tab-btn tab-active' : 'tab-btn'}
            onClick={() => setActiveTab('shs')}
          >
            SHS Courses
          </button>
        </div>

        {/* => Active/Deleted toggle - lets you get back courses that were
            => soft-deleted. Nothing is ever hard-deleted, so this list is
            => never actually empty of history, just filtered out by default. */}
        <div className="view-toggle">
          <button
            className={viewMode === 'active' ? 'view-toggle-btn view-toggle-active' : 'view-toggle-btn'}
            onClick={() => setViewMode('active')}
          >
            Active/Inactive
          </button>
          <button
            className={viewMode === 'deleted' ? 'view-toggle-btn view-toggle-active' : 'view-toggle-btn'}
            onClick={() => setViewMode('deleted')}
          >
            Deleted
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════
          SEARCH + FILTER ROW
          => Client-side only, mirrors Classes.jsx's Trainers tab - filters
             whatever's already loaded, fields swap based on activeTab.
             Placed above the guidelines block per your request.
          ════════════════════════════════════ */}
      <div className="adm-search-wrap">
        <div className="adm-search-row">
          <input
            type="text"
            className="adm-search-input"
            placeholder={activeTab === 'tesda' ? 'Search by title or accreditation no...' : 'Search by title...'}
            value={activeTab === 'tesda' ? tesdaSearchTerm : shsSearchTerm}
            onChange={(e) =>
              activeTab === 'tesda' ? setTesdaSearchTerm(e.target.value) : setShsSearchTerm(e.target.value)
            }
          />
        </div>
      </div>

      <div className="adm-filter-wrap">
        {activeTab === 'tesda' ? (
          <>
            <div className="adm-filter-group">
              <span className="adm-filter-label">Sector</span>
              <select
                className="adm-filter-select"
                value={tesdaSectorFilter}
                onChange={(e) => setTesdaSectorFilter(e.target.value)}
              >
                <option value="ALL">All</option>
                {tesdaSectorOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="adm-filter-group">
              <span className="adm-filter-label">NC Level</span>
              <select
                className="adm-filter-select"
                value={tesdaNcLevelFilter}
                onChange={(e) => setTesdaNcLevelFilter(e.target.value)}
              >
                <option value="ALL">All</option>
                {tesdaNcLevelOptions.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            {/* => Status filter hidden in Deleted view - every row there
                   is already deleted, filtering by active/inactive on top
                   of that doesn't mean anything useful */}
            {!isDeletedView && (
              <div className="adm-filter-group">
                <span className="adm-filter-label">Status</span>
                <select
                  className="adm-filter-select"
                  value={tesdaStatusFilter}
                  onChange={(e) => setTesdaStatusFilter(e.target.value)}
                >
                  <option value="ALL">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="adm-filter-group">
              <span className="adm-filter-label">Cluster</span>
              <select
                className="adm-filter-select"
                value={shsClusterFilter}
                onChange={(e) => setShsClusterFilter(e.target.value)}
              >
                <option value="ALL">All</option>
                {shsClusterOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="adm-filter-group">
              <span className="adm-filter-label">Grade Level</span>
              <select
                className="adm-filter-select"
                value={shsGradeLevelFilter}
                onChange={(e) => setShsGradeLevelFilter(e.target.value)}
              >
                <option value="ALL">All</option>
                {shsGradeLevelOptions.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            {!isDeletedView && (
              <div className="adm-filter-group">
                <span className="adm-filter-label">Status</span>
                <select
                  className="adm-filter-select"
                  value={shsStatusFilter}
                  onChange={(e) => setShsStatusFilter(e.target.value)}
                >
                  <option value="ALL">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            )}
          </>
        )}
      </div>

      {/* => Placeholder guidance text, positioned right above the table - swap for your real copy later */}
      {!isDeletedView && (
        <div className="courses-guidelines">
          {activeTab === 'tesda' ? (
            <>
              <p>
                <strong>Adding a TESDA course:</strong> first make sure the course's Sector already exists using
                "+ Manage Sectors" above. Once the Sector is in place, click "+ Add Course" to create the TESDA course itself.
              </p>
              <div className="guideline-links">
                <a className="guideline-link" href="https://www.tesda.gov.ph/Download/Training_Regulations" target="_blank" rel="noopener noreferrer">
                  TESDA Courses Guidelines <span className="guideline-link-arrow">↗</span>
                </a>
                <a className="guideline-link" href="https://www.tesda.gov.ph/About/TESDA/9612" target="_blank" rel="noopener noreferrer">
                  TESDA Sectors Guidelines <span className="guideline-link-arrow">↗</span>
                </a>
              </div>
            </>
          ) : (
            <>
              <p>
                <strong>Adding an SHS course:</strong> first make sure the course's Cluster already exists using
                "+ Manage Clusters" above. Once the Cluster is in place, click "+ Add Course" to create the SHS course itself.
              </p>
              <div className="guideline-links">
                <a className="guideline-link" href="https://www.deped.gov.ph/strengthened-shs-program/?_gl=1*y3agw0*_ga*MTYyNDk2MDgxLjE3ODMwODE1MTA.*_ga_W56M66QXKT*czE3ODQxMDEwMDAkbzIkZzAkdDE3ODQxMDEwMDAkajYwJGwwJGgw#techProElectives" target="_blank" rel="noopener noreferrer">
                  SHS Courses Guidelines <span className="guideline-link-arrow">↗</span>
                </a>
              </div>
            </>
          )}
        </div>
      )}

      {loading ? (
        <LoadingState message="Loading courses…" />
      ) : fetchError ? (
        // => Kept the existing Retry button behavior, now wired through
        //    LoadingState's onRetry prop instead of a local btn-secondary
        <LoadingState variant="error" message={fetchError} onRetry={fetchCourses} />
      ) : (
        <div className="courses-table-wrap">
        <table className="courses-table" style={{ minWidth: activeTab === 'tesda' ? '760px' : '560px' }}>
          {/* => colgroup gives table-layout: fixed a real width per column
                 instead of letting header text bleed into the next column
                 on narrow screens - same fix already applied on
                 Students.css / Reports.css */}
          {activeTab === 'tesda' ? (
            <colgroup>
              <col style={{ width: '26%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '18%' }} />
            </colgroup>
          ) : (
            <colgroup>
              <col style={{ width: '34%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '24%' }} />
            </colgroup>
          )}
          <thead>
            {activeTab === 'tesda' ? (
              <tr>
                <th>Title</th>
                <th>Accreditation No.</th>
                <th>Sector</th>
                <th>NC Level</th>
                <th>Hours</th>
                <th>{isDeletedView ? 'Action' : 'Status'}</th>
              </tr>
            ) : (
              <tr>
                <th>Title</th>
                <th>Cluster</th>
                <th>Grade Level</th>
                <th>{isDeletedView ? 'Action' : 'Status'}</th>
              </tr>
            )}
          </thead>
          <tbody>
            {filteredList.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="courses-empty">
                  {/* => Distinguishes "nothing matches the filter" from a
                         genuinely empty list, same as Classes.jsx's Trainers tab */}
                  {activeList.length > 0
                    ? `No ${activeTab === 'tesda' ? 'TESDA' : 'SHS'} courses match this filter.`
                    : isDeletedView
                    ? `No deleted ${activeTab === 'tesda' ? 'TESDA' : 'SHS'} courses.`
                    : `No ${activeTab === 'tesda' ? 'TESDA' : 'SHS'} courses yet. Click "+ Add Course" to add one.`}
                </td>
              </tr>
            ) : (
              filteredList.map((course) => (
                <tr
                  key={course.admin_uuid}
                  className={isDeletedView ? 'courses-row courses-row-static' : 'courses-row'}
                  onClick={isDeletedView ? undefined : () => navigate(`/dashboard/courses/${activeTab}/${course.admin_uuid}`)}
                >
                  {activeTab === 'tesda' ? (
                    <>
                      <td>{course.title}</td>
                      <td>{course.accreditation_no}</td>
                      <td>{course.sector_name || '-'}</td>
                      <td>{course.certification_type || '-'}</td>
                      <td>{course.hours}</td>
                      <td>
                        {isDeletedView ? (
                          <button className="btn-restore" onClick={() => handleRestore(course)}>
                            Restore
                          </button>
                        ) : (
                          <span className={`status-badge status-${course.status}`}>{course.status}</span>
                        )}
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{course.title}</td>
                      <td>{course.cluster_name || '-'}</td>
                      <td>{course.grade_level}</td>
                      <td>
                        {isDeletedView ? (
                          <button className="btn-restore" onClick={() => handleRestore(course)}>
                            Restore
                          </button>
                        ) : (
                          <span className={`status-badge status-${course.status}`}>{course.status}</span>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      )}

      {isCreateModalOpen && activeTab === 'tesda' && (
        <CreateTesdaCourseModal onClose={() => setIsCreateModalOpen(false)} onCreated={handleCourseCreated} />
      )}
      {isCreateModalOpen && activeTab === 'shs' && (
        <CreateShsCourseModal onClose={() => setIsCreateModalOpen(false)} onCreated={handleCourseCreated} />
      )}
      {isAddSectorModalOpen && (
        <AddSectorModal
          onClose={() => setIsAddSectorModalOpen(false)}
          onCreated={() => setIsAddSectorModalOpen(false)}
        />
      )}
      {isAddClusterModalOpen && (
        <AddClusterModal
          onClose={() => setIsAddClusterModalOpen(false)}
          onCreated={() => setIsAddClusterModalOpen(false)}
        />
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        message={confirmModal.message}
        onConfirm={handleConfirmYes}
        onCancel={closeConfirm}
      />
    </main>
  );
}
