// => controllers/Classes/adminClassSessionController.js
// => Thin controller layer - delegates all logic to the service, mirrors
//    adminFacilityController.js's pattern.

import {
  fetchFacilitiesForSessionPicker,
  fetchFacilitySessionPage,
  fetchRemoteSessions,
  fetchSessionsForBatch,
  fetchEligibleBatchesForFacility,
  fetchAllActiveBatchesForRemote,
  addClassSession,
  fetchFacilityActivityLogs,
  updateClassSession,
  cancelClassSession,
  addRecurringClassSessions,
  fetchSeriesSessionCount,
  cancelClassSessionSeries,
  updateClassSessionSeries,
} from '../../services/Classes/adminClassSessionService.js';

// => Shared with createClassSessionController below - the set of service
//    error messages that represent a validation problem (400) rather than
//    an unexpected server failure (500).
const KNOWN_VALIDATION_MESSAGES = [
  'required', 'must be after', 'weekdays', '8:00 AM', 'not found',
  'not allowed for the selected course', 'already booked', 'Grade level is required',
  'assigned to another session', 'in the past', 'already passed', 'conflict on',
  'above the', 'matching dates', 'weekend', 'weekday',
  'not part of a recurring series', 'No upcoming sessions', 'conflicts with an existing booking', // => NEW
];

//
// GET /api/admin/class-sessions/facilities
// => Powers the Class Sessions tab's "Facility-Based" subsection
//
export const listFacilitiesForSessionPicker = async (req, res) => {
  try {
    const facilities = await fetchFacilitiesForSessionPicker();
    return res.status(200).json({ facilities });
  } catch (err) {
    console.error('listFacilitiesForSessionPicker error:', err);
    return res.status(500).json({ error: 'Failed to fetch facilities.' });
  }
};

//
// GET /api/admin/class-sessions/facilities/:facilityPublicId?from=YYYY-MM-DD&to=YYYY-MM-DD
//
export const getFacilitySessionPage = async (req, res) => {
  const { facilityPublicId } = req.params;
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to query params are required.' });

  res.set('Cache-Control', 'no-store');
  try {
    const page = await fetchFacilitySessionPage(facilityPublicId, { from, to });
    if (!page) return res.status(404).json({ error: 'Facility not found.' });
    return res.status(200).json(page);
  } catch (err) {
    console.error('getFacilitySessionPage error:', err);
    return res.status(500).json({ error: 'Failed to fetch facility sessions.' });
  }
};

//
// GET /api/admin/class-sessions/remote?from=YYYY-MM-DD&to=YYYY-MM-DD
// => NEW - powers the Class Sessions tab's "Mobile & Online" subsection
//
export const listRemoteSessions = async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to query params are required.' });

  res.set('Cache-Control', 'no-store');
  try {
    const sessions = await fetchRemoteSessions({ from, to });
    return res.status(200).json({ sessions });
  } catch (err) {
    console.error('listRemoteSessions error:', err);
    return res.status(500).json({ error: 'Failed to fetch Mobile/Online sessions.' });
  }
};

//
// GET /api/admin/class-sessions/batch/:batchType/:batchPublicId
// => Powers the Class Sessions section on TesdaBatchDetail/ShsBatchDetail
//
export const listSessionsForBatch = async (req, res) => {
  const { batchType, batchPublicId } = req.params;
  res.set('Cache-Control', 'no-store');
  try {
    const sessions = await fetchSessionsForBatch(batchType, batchPublicId);
    if (sessions === null) return res.status(404).json({ error: 'Batch not found.' });
    return res.status(200).json({ sessions });
  } catch (err) {
    console.error('listSessionsForBatch error:', err);
    return res.status(500).json({ error: 'Failed to fetch sessions for this batch.' });
  }
};


//
// GET /api/admin/class-sessions/facilities/:facilityPublicId/eligible-batches
// => Add Session modal, Local mode
//
export const getEligibleBatches = async (req, res) => {
  const { facilityPublicId } = req.params;
  res.set('Cache-Control', 'no-store');
  try {
    const batches = await fetchEligibleBatchesForFacility(facilityPublicId);
    if (!batches) return res.status(404).json({ error: 'Facility not found.' });
    return res.status(200).json(batches);
  } catch (err) {
    console.error('getEligibleBatches error:', err);
    return res.status(500).json({ error: 'Failed to fetch eligible batches.' });
  }
};

//
// GET /api/admin/class-sessions/batches
// => NEW - Add Session modal, Mobile/Online mode (unfiltered, no facility)
//
export const getRemoteEligibleBatches = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const batches = await fetchAllActiveBatchesForRemote();
    return res.status(200).json(batches);
  } catch (err) {
    console.error('getRemoteEligibleBatches error:', err);
    return res.status(500).json({ error: 'Failed to fetch batches.' });
  }
};

//
// POST /api/admin/class-sessions
// => Body: { session_type, facility_public_id, batch_type, batch_id,
//            session_date, start_time, end_time, trainer_id, shs_course_id,
//            mobile_location, meeting_link, remarks }
//
export const createClassSessionController = async (req, res) => {
  try {
    const session = await addClassSession(
      req.body,
      { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name }
    );
    return res.status(201).json({ success: true, session });
  } catch (err) {
    if (KNOWN_VALIDATION_MESSAGES.some(m => err.message.includes(m))) {
      return res.status(400).json({ error: err.message });
    }
    console.error('createClassSessionController error:', err);
    return res.status(500).json({ error: 'Failed to create class session.' });
  }
};

//
// PATCH /api/admin/class-sessions/:sessionPublicId
// => Body: { session_date, start_time, end_time, trainer_id, mobile_location, meeting_link, remarks }
//
export const updateClassSessionController = async (req, res) => {
  try {
    const session = await updateClassSession(
      req.params.sessionPublicId,
      req.body,
      { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name }
    );
    return res.status(200).json({ success: true, session });
  } catch (err) {
    if (KNOWN_VALIDATION_MESSAGES.some(m => err.message.includes(m))) {
      return res.status(400).json({ error: err.message });
    }
    console.error('updateClassSessionController error:', err);
    return res.status(500).json({ error: 'Failed to update class session.' });
  }
};

//
// DELETE /api/admin/class-sessions/:sessionPublicId
// => Soft delete - sets deleted_at, never removes the row.
//
export const cancelClassSessionController = async (req, res) => {
  try {
    await cancelClassSession(
      req.params.sessionPublicId,
      { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name }
    );
    return res.status(200).json({ success: true });
  } catch (err) {
    if (KNOWN_VALIDATION_MESSAGES.some(m => err.message.includes(m))) {
      return res.status(400).json({ error: err.message });
    }
    console.error('cancelClassSessionController error:', err);
    return res.status(500).json({ error: 'Failed to cancel class session.' });
  }
};

//
// POST /api/admin/class-sessions/recurring
// => Body: same as POST / plus { start_date, until_date, repeat_days: [1,2,3,4,5] }
//
export const createRecurringClassSessionsController = async (req, res) => {
  try {
    const result = await addRecurringClassSessions(
      req.body,
      { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name }
    );
    return res.status(201).json({ success: true, ...result });
  } catch (err) {
    if (KNOWN_VALIDATION_MESSAGES.some(m => err.message.includes(m))) {
      return res.status(400).json({ error: err.message });
    }
    console.error('createRecurringClassSessionsController error:', err);
    return res.status(500).json({ error: 'Failed to create recurring class sessions.' });
  }
};

//
// GET /api/admin/class-sessions/series/:recurrenceGroupId/count
//
export const getSeriesSessionCountController = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const count = await fetchSeriesSessionCount(req.params.recurrenceGroupId);
    return res.status(200).json({ count });
  } catch (err) {
    console.error('getSeriesSessionCountController error:', err);
    return res.status(500).json({ error: 'Failed to fetch series session count.' });
  }
};

//
// DELETE /api/admin/class-sessions/series/:recurrenceGroupId
// => Bulk soft delete of every still-active session in the series.
//
export const cancelClassSessionSeriesController = async (req, res) => {
  try {
    const result = await cancelClassSessionSeries(
      req.params.recurrenceGroupId,
      { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name }
    );
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    if (KNOWN_VALIDATION_MESSAGES.some(m => err.message.includes(m))) {
      return res.status(400).json({ error: err.message });
    }
    console.error('cancelClassSessionSeriesController error:', err);
    return res.status(500).json({ error: 'Failed to cancel the series.' });
  }
};


//
// PATCH /api/admin/class-sessions/series/:recurrenceGroupId
// => Body: { start_time, end_time, trainer_id, mobile_location, meeting_link, remarks }
//    session_date is intentionally not accepted here - see the service.
//
export const updateClassSessionSeriesController = async (req, res) => {
  try {
    const result = await updateClassSessionSeries(
      req.params.recurrenceGroupId,
      req.body,
      { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name }
    );
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    if (KNOWN_VALIDATION_MESSAGES.some(m => err.message.includes(m))) {
      return res.status(400).json({ error: err.message });
    }
    console.error('updateClassSessionSeriesController error:', err);
    return res.status(500).json({ error: 'Failed to update the series.' });
  }
};


//
// GET /api/admin/class-sessions/facilities/:facilityPublicId/logs?page=1
// => Powers the Activity Logs section below the calendar on
//    FacilitySessionCalendar - always most-recent-first, 10 per page
//
export const getFacilityActivityLogsController = async (req, res) => {
  const { facilityPublicId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;

  res.set('Cache-Control', 'no-store');
  try {
    const result = await fetchFacilityActivityLogs(facilityPublicId, page);
    if (!result) return res.status(404).json({ error: 'Facility not found.' });
    return res.status(200).json(result);
  } catch (err) {
    console.error('getFacilityActivityLogsController error:', err);
    return res.status(500).json({ error: 'Failed to fetch activity logs.' });
  }
};