// => admin/controllers/Classes/adminBatchController.js
// => Thin controller layer - delegates all logic to the service
// => Mirrors adminFacilityController.js / adminTrainerRoutes.js pattern

import {
  fetchActiveBatches,
  fetchTesdaBatchDetail,
  fetchShsBatchDetail,
  fetchTesdaBatchLogs,
  fetchShsBatchLogs,
  changeTesdaBatchStatus,
  changeShsBatchStatus,
  addTesdaBatch,
  addShsBatch,
  editTesdaBatchDetails,
  editShsBatchDetails,
  setShsBatchGrade11Completed,
  searchBatchesService,
  fetchBatchFormOptions,
  assignTesdaEnrollment,
  assignShsEnrollment,
} from '../../services/Classes/adminBatchServices.js';

// GET /api/admin/batches
export const listActiveBatches = async (req, res) => {
  try {
    const batches = await fetchActiveBatches();
    return res.status(200).json({ batches });
  } catch (err) {
    console.error('listActiveBatches error:', err);
    return res.status(500).json({ error: 'Failed to fetch batches.' });
  }
};

// GET /api/admin/batches/search
// => trainer_id (TESDA, exact match) and grade_level (SHS-only, matches
//    against enrolled students' course grade level) replace the old
//    free-text instructor_name param
export const searchBatchesController = async (req, res) => {
  // => Renamed from course_name to batch_name - this searches the batch's
  //    display name (TESDA course title OR SHS cluster name), not a
  //    TESDA-only "course" concept, so the old name was misleading
  const { batch_name, trainer_id, status, sector, program_type, cluster, grade_level, start_date_from, start_date_to } = req.query;
  try {
    const results = await searchBatchesService({
      batch_name, trainer_id, status, sector, program_type, cluster, grade_level, start_date_from, start_date_to,
    });
    return res.json({ batches: results });
  } catch (err) {
    const statusCode = err.message.includes('required') ? 400 : 500;
    return res.status(statusCode).json({ error: err.message });
  }
};

// GET /api/admin/batches/form-options
export const getFormOptions = async (req, res) => {
  try {
    const options = await fetchBatchFormOptions();
    return res.status(200).json(options);
  } catch (err) {
    console.error('getFormOptions error:', err);
    return res.status(500).json({ error: 'Failed to fetch form options.' });
  }
};

// GET /api/admin/batches/tesda/:publicId
export const getTesdaBatchDetail = async (req, res) => {
  const { publicId } = req.params;
  try {
    const data = await fetchTesdaBatchDetail(publicId);
    if (!data) return res.status(404).json({ error: 'Batch not found.' });
    return res.status(200).json(data);
  } catch (err) {
    console.error('getTesdaBatchDetail error:', err);
    return res.status(500).json({ error: 'Failed to fetch batch detail.' });
  }
};

// GET /api/admin/batches/shs/:publicId
export const getShsBatchDetailController = async (req, res) => {
  const { publicId } = req.params;
  try {
    const data = await fetchShsBatchDetail(publicId);
    if (!data) return res.status(404).json({ error: 'Batch not found.' });
    return res.status(200).json(data);
  } catch (err) {
    console.error('getShsBatchDetail error:', err);
    return res.status(500).json({ error: 'Failed to fetch batch detail.' });
  }
};

// GET /api/admin/batches/tesda/:publicId/logs
export const getTesdaBatchLogsController = async (req, res) => {
  const { publicId } = req.params;
  try {
    const logs = await fetchTesdaBatchLogs(publicId);
    if (logs === null) return res.status(404).json({ error: 'Batch not found.' });
    return res.status(200).json({ logs });
  } catch (err) {
    console.error('getTesdaBatchLogsController error:', err);
    return res.status(500).json({ error: 'Failed to fetch batch logs.' });
  }
};

// GET /api/admin/batches/shs/:publicId/logs
export const getShsBatchLogsController = async (req, res) => {
  const { publicId } = req.params;
  try {
    const logs = await fetchShsBatchLogs(publicId);
    if (logs === null) return res.status(404).json({ error: 'Batch not found.' });
    return res.status(200).json({ logs });
  } catch (err) {
    console.error('getShsBatchLogsController error:', err);
    return res.status(500).json({ error: 'Failed to fetch batch logs.' });
  }
};

// PATCH /api/admin/batches/tesda/:publicId/status
export const patchTesdaBatchStatus = async (req, res) => {
  const { publicId } = req.params;
  const { status, remarks } = req.body;
  if (!status) return res.status(400).json({ error: 'status is required.' });

  try {
    const updated = await changeTesdaBatchStatus(publicId, status, remarks, req.admin?.admin_id ?? null);
    if (!updated) return res.status(404).json({ error: 'Batch not found.' });
    return res.status(200).json({ success: true, updated });
  } catch (err) {
    if (err.message?.startsWith('Invalid status') || err.message?.startsWith('Cannot set status') || err.message?.includes('required')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('patchTesdaBatchStatus error:', err);
    return res.status(500).json({ error: 'Failed to update batch status.' });
  }
};

// PATCH /api/admin/batches/shs/:publicId/status
export const patchShsBatchStatus = async (req, res) => {
  const { publicId } = req.params;
  const { status, remarks } = req.body;
  if (!status) return res.status(400).json({ error: 'status is required.' });

  try {
    const updated = await changeShsBatchStatus(publicId, status, remarks, req.admin?.admin_id ?? null);
    if (!updated) return res.status(404).json({ error: 'Batch not found.' });
    return res.status(200).json({ success: true, updated });
  } catch (err) {
    if (err.message?.startsWith('Invalid status') || err.message?.startsWith('Cannot set status') || err.message?.includes('required')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('patchShsBatchStatus error:', err);
    return res.status(500).json({ error: 'Failed to update batch status.' });
  }
};

// POST /api/admin/batches/tesda
// => Trainer qualification is a hard block here - no confirm path, unlike SHS
export const createTesdaBatchController = async (req, res) => {
  try {
    const batchData = { ...req.body, created_by: req.admin?.admin_id ?? null };
    const created = await addTesdaBatch(batchData);
    return res.status(201).json({ success: true, batch: created });
  } catch (err) {
    if (err.message.includes('required') || err.message.includes('cannot') || err.message.includes('accredited') || err.message.includes('date')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('createTesdaBatchController error:', err);
    return res.status(500).json({ error: 'Failed to create batch.' });
  }
};

// POST /api/admin/batches/shs
// => Trainer qualification is a hard block, same as TESDA - the dropdown
//    only ever offers qualified trainers now, so this is a safety net
export const createShsBatchController = async (req, res) => {
  try {
    const batchData = { ...req.body, created_by: req.admin?.admin_id ?? null };
    const created = await addShsBatch(batchData);
    return res.status(201).json({ success: true, batch: created });
  } catch (err) {
    if (err.message.includes('required') || err.message.includes('cannot') || err.message.includes('date') || err.message.includes('qualified')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('createShsBatchController error:', err);
    return res.status(500).json({ error: 'Failed to create batch.' });
  }
};

// PATCH /api/admin/batches/tesda/:publicId
// => Edits everything EXCEPT course_id, which is permanently locked -
//    changing the course requires Dissolve + create a new batch instead
export const updateTesdaBatchController = async (req, res) => {
  const { publicId } = req.params;
  try {
    const existing = await fetchTesdaBatchDetail(publicId);
    if (!existing) return res.status(404).json({ error: 'Batch not found.' });

    const updated = await editTesdaBatchDetails(
      publicId,
      req.body,
      existing.batchRow.course_id,
      req.admin?.admin_id ?? null,
      existing.batchRow.batch_id
    );
    return res.status(200).json({ success: true, updated });
  } catch (err) {
    if (err.message.includes('required') || err.message.includes('cannot') || err.message.includes('accredited') || err.message.includes('date')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('updateTesdaBatchController error:', err);
    return res.status(500).json({ error: 'Failed to update batch.' });
  }
};

// PATCH /api/admin/batches/shs/:publicId
// => Same as above - cluster is permanently locked, everything else editable.
// => Trainer qualification is a hard block, matching creation and TESDA.
export const updateShsBatchController = async (req, res) => {
  const { publicId } = req.params;
  try {
    const existing = await fetchShsBatchDetail(publicId);
    if (!existing) return res.status(404).json({ error: 'Batch not found.' });

    const updated = await editShsBatchDetails(
      publicId,
      req.body,
      existing.batchRow.cluster_id,
      req.admin?.admin_id ?? null,
      existing.batchRow.batch_id
    );
    return res.status(200).json({ success: true, updated });
  } catch (err) {
    if (err.message.includes('required') || err.message.includes('cannot') || err.message.includes('date') || err.message.includes('qualified')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('updateShsBatchController error:', err);
    return res.status(500).json({ error: 'Failed to update batch.' });
  }
};

// PATCH /api/admin/batches/shs/:publicId/grade11-completed
export const markShsGrade11CompletedController = async (req, res) => {
  const { publicId } = req.params;
  try {
    const existing = await fetchShsBatchDetail(publicId);
    if (!existing) return res.status(404).json({ error: 'Batch not found.' });

    const updated = await setShsBatchGrade11Completed(publicId, req.admin?.admin_id ?? null, existing.batchRow.batch_id);
    if (!updated) return res.status(404).json({ error: 'Batch not found.' });
    return res.status(200).json({ success: true, updated });
  } catch (err) {
    console.error('markShsGrade11CompletedController error:', err);
    return res.status(500).json({ error: 'Failed to update Grade 11 status.' });
  }
};

// PATCH /api/admin/batches/tesda/:publicId/assign-enrollment
// => Body: { enrollment_public_id }
export const assignTesdaEnrollmentController = async (req, res) => {
  const { publicId } = req.params;
  const { enrollment_public_id } = req.body;
  if (!enrollment_public_id) {
    return res.status(400).json({ error: 'enrollment_public_id is required.' });
  }

  try {
    const updated = await assignTesdaEnrollment(enrollment_public_id, publicId);
    return res.status(200).json({ success: true, updated });
  } catch (err) {
    const statusCode = err.message.includes('not found') ? 404
      : (err.message.includes('full') || err.message.includes('does not offer')) ? 400
      : 500;
    if (statusCode === 500) console.error('assignTesdaEnrollmentController error:', err);
    return res.status(statusCode).json({ error: err.message });
  }
};

// PATCH /api/admin/batches/shs/:publicId/assign-enrollment
export const assignShsEnrollmentController = async (req, res) => {
  const { publicId } = req.params;
  const { enrollment_public_id } = req.body;
  if (!enrollment_public_id) {
    return res.status(400).json({ error: 'enrollment_public_id is required.' });
  }

  try {
    const updated = await assignShsEnrollment(enrollment_public_id, publicId);
    return res.status(200).json({ success: true, updated });
  } catch (err) {
    const statusCode = err.message.includes('not found') ? 404
      : (err.message.includes('full') || err.message.includes('does not match')) ? 400
      : 500;
    if (statusCode === 500) console.error('assignShsEnrollmentController error:', err);
    return res.status(statusCode).json({ error: err.message });
  }
};
