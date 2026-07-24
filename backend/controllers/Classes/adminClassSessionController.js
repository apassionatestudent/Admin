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
} from '../../services/Classes/adminClassSessionService.js';

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
    const knownValidationMessages = [
      'required', 'must be after', 'weekdays', '8:00 AM', 'not found',
      'not allowed for the selected course', 'already booked', 'Grade level is required',
      'assigned to another session', // => NEW - trainer conflict
    ];
    if (knownValidationMessages.some(m => err.message.includes(m))) {
      return res.status(400).json({ error: err.message });
    }
    console.error('createClassSessionController error:', err);
    return res.status(500).json({ error: 'Failed to create class session.' });
  }
};