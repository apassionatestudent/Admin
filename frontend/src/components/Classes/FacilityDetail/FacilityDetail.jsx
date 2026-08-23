// => components/Classes/FacilityDetail/FacilityDetail.jsx
// => Full-page detail/edit view for a single facility. Mirrors ClassDetail's
//    role for Batches - reached by clicking a row in the Facilities tab table.
// => Route (already added to App.jsx): /dashboard/facilities/:publicId
//
// => IMPORTANT FIX: the facility fetch and the tesda-courses/clusters fetch
//    used to be one single Promise.all - if EITHER of the option endpoints
//    failed (e.g. /api/admin/clusters not existing, still unconfirmed),
//    the whole thing rejected and the facility itself failed to display
//    even though it may have loaded fine. Split into two independent
//    effects below: the facility load is now the only thing that can put
//    the page into a hard error state. A failed options load just leaves
//    the checklists empty with their own small error note instead.
//
// => BackButton confirmed working with destination="Classes" (not `label`,
//    that guess was wrong).
// => ASSUMPTION still open: /api/admin/clusters response shape and even its
//    existence - if it 404s, the SHS Clusters checklist will show its
//    load-error note but the rest of the page still works now.

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import axiosAdmin from '../../../utils/axiosAdmin.js'; 
import BackButton from '../../BackButton/BackButton.jsx'; 
import RemarksActionModal from '../RemarksActionModal/RemarksActionModal.jsx';
import FormActions from '../../FormActions/FormActions.jsx';
import warningIcon from '../../../assets/icons/warning.png'; // => still used by the inline form-error messages further down
// => Shared spinner/error block, replaces the local fd-state markup below
import LoadingState from '../../LoadingState/loadingState.jsx'; 
import pencilIcon from '../../../assets/icons/pencil.png'; // 
import LogComponent from '../../LogComponent/logComponent.jsx'; // => shared log table, chevron icon lives inside it now
import './FacilityDetail.css';

// => Formats ISO datetime to readable PH local time - same pattern used on
//    TrainerDetail/TesdaBatchDetail/ShsBatchDetail for consistency
const formatDateTime = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export default function FacilityDetail() {
  const { publicId } = useParams();
  const navigate = useNavigate();

  const [facility, setFacility] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // => Edit form state - separate from `facility` (the last-saved server
  //    state) so unsaved edits don't get lost if something else re-renders
  const [form, setForm] = useState(null);

  const [tesdaCourses, setTesdaCourses] = useState([]);
  const [shsCourses, setShsCourses] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // => Controls read-only vs edit mode for the whole form card. Starts
  //    false (read-only first), matching TesdaCourseDetail's pencil-to-edit
  //    pattern instead of landing straight into an editable form.
  const [isEditing, setIsEditing] = useState(false);

  // => Status change confirmation - the select's value stays bound to
  //    form.status (not pendingStatus), so if the admin cancels, the
  //    dropdown visually reverts on its own since form.status never changed
  const [pendingStatus, setPendingStatus] = useState(null);

  // => Holds the remarks text captured from RemarksActionModal for a
  //    pending status change - staged alongside pendingStatus, not written
  //    to the database until "Save Changes" is clicked, same as every
  //    other field on this form
  const [statusChangeRemarks, setStatusChangeRemarks] = useState(null);

  // => Delete flow now needs its own RemarksActionModal (remarks are
  //    always required on delete), separate from the status-change one above
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // => Activity Logs state - built from scratch, this page had no logs
  //    section before. Matches TesdaBatchDetail/ShsBatchDetail exactly:
  //    fetch everything at once, no pagination, chevron-expandable rows.
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);


  // => Loads the facility itself. This is the ONLY fetch that can put the
  //    page into the hard "Failed to load facility" error state.
  useEffect(() => {
    const loadFacility = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const facilityRes = await axiosAdmin.get(`/api/admin/facilities/${publicId}`);
        const f = facilityRes.data.facility;
        setFacility(f);
        setForm({
          name: f.name,
          capacity: f.capacity ?? '',
          allows_all_courses: f.allows_all_courses,
          status: f.status,
          tesda_course_ids: f.tesda_course_ids,
          shs_course_ids: f.shs_course_ids,
        });
      } catch (err) {
        console.error('Failed to load facility:', err);
        setLoadError('Failed to load facility. It may not exist or may have been deleted.');
      } finally {
        setLoading(false);
      }
    };
    loadFacility();
  }, [publicId]);

  // => Loads the checklist options separately - a failure here only affects
  //    the checklists (shown as optionsError below them), never blocks the
  //    facility itself from displaying
  useEffect(() => {
    const loadOptions = async () => {
      setOptionsLoading(true);
      setOptionsError(null);
      try {
        //    mirroring /api/admin/tesda-courses - confirm the real path
        const [tesdaRes, shsCoursesRes] = await Promise.all([
          axiosAdmin.get('/api/admin/tesda-courses'),
          axiosAdmin.get('/api/admin/shs-courses'),
        ]);
        setTesdaCourses(tesdaRes.data.data);
        //    shape from /api/admin/shs-courses turns out different
        setShsCourses(shsCoursesRes.data.courses ?? shsCoursesRes.data.data ?? []);
      } catch (err) {
        console.error('Failed to load course/cluster options:', err);
        setOptionsError('Could not load course/cluster options. You can still edit the name, capacity, and status below.');
      } finally {
        setOptionsLoading(false);
      }
    };
    loadOptions();
  }, []);

  // => Fetches every activity log for this facility. Called on mount and
  //    again after every successful save, so a newly written log (e.g.
  //    from a status change or edit) shows up immediately instead of
  //    waiting for an unrelated page action to trigger a refetch - same
  //    fetchLogs() bug already fixed on the Batch detail pages.
  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await axiosAdmin.get(`/api/admin/facilities/${publicId}/logs`);
      setLogs(res.data.logs || []);
    } catch (err) {
      console.error('Failed to fetch facility logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  // => Column defs handed to LogComponent, matches the Date/Actor/Action/
  //    Details layout used on TesdaBatchDetail and ShsBatchDetail,
  //    including the System actor badge
  const logColumns = [
    { key: 'date', header: 'Date', render: (log) => formatDateTime(log.created_at) },
    {
      key: 'actor',
      header: 'Actor',
      render: (log) => log.actor_type === 'System' ? (
        <span className="adm-badge" style={{ background: '#ede9fe', color: '#5b21b6' }}>System</span>
      ) : (
        log.actor_name
      ),
    },
    { key: 'action', header: 'Action', render: (log) => log.action },
    {
      key: 'details',
      header: 'Details',
      cellClassName: 'logc-log-detail-cell',
      render: (log) => log.action_detail || '-',
    },
  ];

  useEffect(() => {
    fetchLogs();
  }, [publicId]);

  const toggleTesdaCourse = (courseId) => {
    setForm(f => ({
      ...f,
      tesda_course_ids: f.tesda_course_ids.includes(courseId)
        ? f.tesda_course_ids.filter(id => id !== courseId)
        : [...f.tesda_course_ids, courseId],
    }));
  };

  const toggleShsCourse = (courseId) => {
    setForm(f => ({
      ...f,
      shs_course_ids: f.shs_course_ids.includes(courseId)
        ? f.shs_course_ids.filter(id => id !== courseId)
        : [...f.shs_course_ids, courseId],
    }));
  };

  // => PATCHes the facility, replacing its restriction rows wholesale
  //    server-side - see updateFacilityWithCourses in adminFacilityModel.js
  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      const res = await axiosAdmin.patch(`/api/admin/facilities/${publicId}`, {
        name: form.name,
        capacity: form.capacity ? Number(form.capacity) : null,
        allows_all_courses: form.allows_all_courses,
        status: form.status,
        tesda_course_ids: form.tesda_course_ids,
        shs_course_ids: form.shs_course_ids,
        // => Only non-null if a status change happened this edit session -
        //    the backend leaves the stored remarks alone otherwise
        remarks: statusChangeRemarks,
      });
      setFacility(res.data.facility);
      toast.success('Changes saved.');
      setIsEditing(false); // => Save exits back to read-only view, same as Cancel
      setStatusChangeRemarks(null); // => Clear the staged remarks now that they're saved
      fetchLogs(); // => Refresh so the new log entry (edit or status change) shows immediately
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  // => Soft-deletes the facility (sets deleted_at server-side, never a hard
  //    delete) then returns to the Facilities list. This page now owns the
  //    confirm/loading/error state itself via RemarksActionModal, since
  //    deletion always requires a remarks reason.
  // => IMPORTANT: axios DELETE requests need the body wrapped in a `data`
  //    config key - passing it as a plain second argument like a POST/PATCH
  //    body silently sends no body at all.
  const handleDelete = async (remarksText) => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await axiosAdmin.delete(`/api/admin/facilities/${publicId}`, {
        data: { remarks: remarksText },
      });
      navigate('/dashboard/classes');
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Failed to delete facility.');
      setDeleting(false);
    }
  };

  // => Resets the form back to the last-saved facility values - Cancel
  //    doesn't leave the page, it just discards in-progress edits
  const handleCancelEdit = () => {
    setForm({
      name: facility.name,
      capacity: facility.capacity ?? '',
      allows_all_courses: facility.allows_all_courses,
      status: facility.status,
      tesda_course_ids: facility.tesda_course_ids,
      shs_course_ids: facility.shs_course_ids,
    });
    setSaveError(null);
    setStatusChangeRemarks(null); // => Discard any staged status-change reason too
    setIsEditing(false); // => Cancel exits back to read-only view, not just discarding edits
  };

  // => Swapped local fd-state spinner/warning markup for the shared
  //    LoadingState component, same variant pattern used elsewhere
  if (loading) {
    return (
      <div className="fd-page">
        <LoadingState message="Loading facility…" />
      </div>
    );
  }

  if (loadError || !facility) {
    return (
      <div className="fd-page">
        <BackButton onClick={() => navigate('/dashboard/classes')} destination="Classes" />
        <LoadingState variant="error" message={loadError || 'Facility not found.'} />
      </div>
    );
  }

  return (
    <div className="fd-page">
      <BackButton onClick={() => navigate('/dashboard/classes')} destination="Classes" />

      <div className="fd-header">
        <h1 className="fd-title">Classes | Facilities | {facility.name}</h1>
        <p className="fd-subtitle">Facility ID #{facility.facility_id}</p>
      </div>

      <div className="fd-form-card">

        {/* => Section header with the pencil-to-edit button, same role as
               TesdaCourseDetail's .section-header + .section-edit-btn */}
        <div className="fd-section-header">
          <h3 className="fd-section-title">Facility Details</h3>
          {!isEditing && (
            <button
              type="button"
              className="fd-section-edit-btn"
              onClick={() => setIsEditing(true)}
            >
              <img className="fd-pencil-icon" src={pencilIcon} alt="Edit" />
            </button>
          )}
        </div>

        {!isEditing ? (
          // => READ-ONLY VIEW - plain text, no inputs. Mirrors
          //    TesdaCourseDetail's .info-view-grid pattern.
          <>
            <div className="fd-info-view-grid">
              <div>
                <span className="fd-field-label">Facility Name</span>
                <p className="fd-view-value">{facility.name}</p>
              </div>
              <div>
                <span className="fd-field-label">Capacity</span>
                <p className="fd-view-value">{facility.capacity ?? 'Not set'}</p>
              </div>
              <div>
                <span className="fd-field-label">Status</span>
                <span className={`status-badge status-${facility.status}`}>{facility.status}</span>
              </div>
              <div>
                <span className="fd-field-label">General Facility</span>
                <p className="fd-view-value">{facility.allows_all_courses ? 'Yes (allows all courses/clusters)' : 'No (restricted)'}</p>
              </div>
              <div>
                <span className="fd-field-label">Last Updated</span>
                <p className="fd-view-value">
                  {formatDateTime(facility.updated_at)}
                  {facility.updated_by_name ? ` by ${facility.updated_by_name}` : ''}
                </p>
              </div>
            </div>

            {/* => Only show the restriction lists if this isn't a general facility
                   => TESDA + SHS side by side, reusing the same grid class as
                      the fields above instead of stacking full-width - the
                      layout was uneven when one list was much longer than
                      the other and both spanned the full width */}
            {!facility.allows_all_courses && (
              <div className="fd-info-view-grid">
                <div>
                  <span className="fd-field-label">Allowed TESDA Courses</span>
                  {tesdaCourses.filter(c => facility.tesda_course_ids.includes(c.course_id)).length === 0 ? (
                    <p className="fd-empty-text">None assigned.</p>
                  ) : (
                    <ul className="fd-view-list">
                      {tesdaCourses
                        .filter(c => facility.tesda_course_ids.includes(c.course_id))
                        .map(c => (
                          <li key={c.course_id}>
                            {c.title}{c.certification_type ? ` (${c.certification_type})` : ''}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>

                <div>
                  <span className="fd-field-label">Allowed SHS Courses</span>
                  {shsCourses.filter(c => facility.shs_course_ids.includes(c.course_id)).length === 0 ? (
                    <p className="fd-empty-text">None assigned.</p>
                  ) : (
                    <ul className="fd-view-list">
                      {shsCourses
                        .filter(c => facility.shs_course_ids.includes(c.course_id))
                        .map(c => <li key={c.course_id}>{c.title}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* => Shows the reason behind the facility's current state, if
                   one was ever recorded - stays blank for facilities that
                   have never had a status change or deletion
                   => Stays below the course lists, always the last field
                      before the Delete button */}
            {facility.remarks && (
              <div className="adm-form-group">
                <span className="fd-field-label">Last Remarks</span>
                <p className="fd-view-value">{facility.remarks}</p>
              </div>
            )}

            {/* => Delete stays reachable from read-only view too, no Cancel/Save
                   needed here since nothing is being edited */}
            <div className="fd-form-actions">
              <button
                type="button"
                className="fd-delete-btn"
                onClick={() => setDeleteModalOpen(true)}
              >
                Delete Facility
              </button>
            </div>
          </>
        ) : (
          // => EDIT VIEW - your existing form, unchanged below
          <>
            <div className="adm-form-group">
              <label className="adm-form-label">Facility Name <span className="adm-form-required">*</span></label>
              <input
                type="text"
                className="adm-form-input"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="adm-form-row">
              <div className="adm-form-group">
                <label className="adm-form-label">Capacity <span className="adm-form-optional">(optional)</span></label>
                <input
                  type="number"
                  min="1"
                  className="adm-form-input"
                  value={form.capacity}
                  onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
                />
              </div>

              <div className="adm-form-group">
                <label className="adm-form-label">Status</label>
                <select
                  className="adm-form-select"
                  value={form.status}
                  onChange={e => {
                    const nextStatus = e.target.value;
                    // => No-op if re-selecting the same value - nothing to confirm
                    if (nextStatus === form.status) return;
                    setPendingStatus(nextStatus);
                  }}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="fd-toggle-row">
              <label className="fd-toggle-label">
                <input
                  type="checkbox"
                  checked={form.allows_all_courses}
                  onChange={e => setForm(f => ({ ...f, allows_all_courses: e.target.checked }))}
                />
                This is a general facility (allows all courses/clusters - e.g. a lecture room)
              </label>
            </div>

            {!form.allows_all_courses && (
              optionsLoading ? (
                <p className="fd-loading-text">Loading course options…</p>
              ) : (
                <>
                  {optionsError && (
                    <p className="adm-form-error"><img className="adm-inline-icon" src={warningIcon} alt="" /> {optionsError}</p>
                  )}

                  <div className="adm-form-group">
                    <label className="adm-form-label">Allowed TESDA Courses</label>
                    <div className="fd-checklist">
                      {tesdaCourses.length === 0 ? (
                        <p className="fd-empty-text">No TESDA courses yet.</p>
                      ) : (
                        tesdaCourses.map(c => (
                          <label key={c.course_id} className="fd-check-item">
                            <input
                              type="checkbox"
                              checked={form.tesda_course_ids.includes(c.course_id)}
                              onChange={() => toggleTesdaCourse(c.course_id)}
                            />
                            {c.title}{c.certification_type ? ` (${c.certification_type})` : ''}
                          </label>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="adm-form-group">
                    <label className="adm-form-label">Allowed SHS Courses</label>
                    <div className="fd-checklist">
                      {shsCourses.length === 0 ? (
                        <p className="fd-empty-text">No SHS courses yet.</p>
                      ) : (
                        shsCourses.map(c => (
                          <label key={c.course_id} className="fd-check-item">
                            <input
                              type="checkbox"
                              checked={form.shs_course_ids.includes(c.course_id)}
                              onChange={() => toggleShsCourse(c.course_id)}
                            />
                            {c.title}
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )
            )}

            {saveError && (
              <p className="adm-form-error"><img className="adm-inline-icon" src={warningIcon} alt="" /> {saveError}</p>
            )}

            <div className="fd-form-actions">
              <button
                type="button"
                className="fd-delete-btn"
                onClick={() => setDeleteModalOpen(true)}
              >
                Delete Facility
              </button>
              <FormActions
                onCancel={handleCancelEdit}
                onSave={handleSave}
                saving={saving}
                saveDisabled={!form.name.trim()}
              />
            </div>
          </>
        )}
      </div>

      {/* => Activity Logs - built from scratch, no prior section existed
             on this page. Design/classes match TesdaBatchDetail/
             ShsBatchDetail's Activity Logs section exactly for visual
             consistency - entity_type = 'facility', entity_id = facility_id
             directly (no join needed, unlike the facility session calendar). */}
      <div className="fd-log-section">
        <p className="fd-log-section-title">
          Activity Logs
          <span className="fd-log-count-inline">{logs.length}</span>
        </p>

        <LogComponent
          logs={logs}
          columns={logColumns}
          loading={logsLoading}
          page={1}
          totalPages={1}
          onPageChange={() => {}}
          emptyMessage="No activity recorded for this facility yet."
          renderDetail={(log) => <p>{log.action_detail || '-'}</p>}
        />
      </div>

      {/* => Requires a remarks reason before the Active/Inactive change is
             staged into `form`. Note this only stages the value - it still
             isn't written to the database until "Save Changes" is clicked,
             consistent with every other field on this form. */}
      <RemarksActionModal
        isOpen={pendingStatus !== null}
        title="Change Status"
        message={
          pendingStatus === 'inactive'
            ? `Mark "${facility.name}" as Inactive? It will no longer be selectable for new class sessions until reactivated.`
            : `Mark "${facility.name}" as Active? It will become available for new class sessions again.`
        }
        confirmLabel="Confirm Status Change"
        onConfirm={(remarksText) => {
          setForm(f => ({ ...f, status: pendingStatus }));
          setStatusChangeRemarks(remarksText);
          setPendingStatus(null);
        }}
        onCancel={() => setPendingStatus(null)}
      />

      {/* => Deletion always requires remarks - no staging step here since
             delete is immediate, not part of the Save Changes flow */}
      <RemarksActionModal
        isOpen={deleteModalOpen}
        title="Delete Facility"
        message={`Delete "${facility.name}"? This can be undone later from the Facilities Deleted tab.`}
        confirmLabel="Delete Facility"
        saving={deleting}
        error={deleteError}
        onConfirm={(remarksText) => {
          setDeleteModalOpen(false);
          handleDelete(remarksText);
        }}
        onCancel={() => { setDeleteModalOpen(false); setDeleteError(null); }}
      />
    </div>
  );
}
