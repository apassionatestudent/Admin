// => controllers/Classes/adminTrainerController.js
// => Thin controller layer - delegates all logic to the service.

import {
  fetchActiveTrainers,
  fetchDeletedTrainers,
  addTrainer,
  fetchTrainerDetail,
  editTrainer,
  deleteTrainer,
  restoreTrainerService,
  fetchTrainerLogs,
} from '../../services/Classes/adminTrainerService.js';

// 
// GET /api/admin/trainers
// 
export const listTrainers = async (req, res) => {
  try {
    const trainers = await fetchActiveTrainers();
    return res.status(200).json({ trainers });
  } catch (err) {
    console.error('listTrainers error:', err);
    return res.status(500).json({ error: 'Failed to fetch trainers.' });
  }
};

// 
// GET /api/admin/trainers/deleted
// => Must be registered BEFORE /:publicId in the router, same rule as
//    adminFacilityRoutes.js's /deleted
// 
export const listDeletedTrainers = async (req, res) => {
  try {
    const trainers = await fetchDeletedTrainers();
    return res.status(200).json({ trainers });
  } catch (err) {
    console.error('listDeletedTrainers error:', err);
    return res.status(500).json({ error: 'Failed to fetch deleted trainers.' });
  }
};

// 
// POST /api/admin/trainers
// => Body: { trainer_full_name, contact_number, email, handles_tesda, handles_shs, tesda_course_ids, shs_course_ids }
// 
export const createTrainerController = async (req, res) => {
  try {
    const trainer = await addTrainer(
      { ...req.body, created_by: req.admin?.admin_id ?? null },
      { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name }
    );
    return res.status(201).json({ success: true, trainer });
  } catch (err) {
    if (err.message.includes('required') || err.message.includes('Select')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('createTrainerController error:', err);
    return res.status(500).json({ error: 'Failed to create trainer.' });
  }
};

// 
// GET /api/admin/trainers/:publicId
// 
export const getTrainerDetailController = async (req, res) => {
  const { publicId } = req.params;
  try {
    const trainer = await fetchTrainerDetail(publicId);
    if (!trainer) return res.status(404).json({ error: 'Trainer not found.' });
    return res.status(200).json({ trainer });
  } catch (err) {
    console.error('getTrainerDetailController error:', err);
    return res.status(500).json({ error: 'Failed to fetch trainer.' });
  }
};

// 
// GET /api/admin/trainers/:publicId/logs
// => Returns every log row for this trainer, newest first - no pagination
// 
export const getTrainerLogsController = async (req, res) => {
  const { publicId } = req.params;
  try {
    const logs = await fetchTrainerLogs(publicId);
    if (logs === null) return res.status(404).json({ error: 'Trainer not found.' });
    return res.status(200).json({ logs });
  } catch (err) {
    console.error('getTrainerLogsController error:', err);
    return res.status(500).json({ error: 'Failed to fetch trainer activity logs.' });
  }
};

// 
// PATCH /api/admin/trainers/:publicId
// 
export const updateTrainerController = async (req, res) => {
  const { publicId } = req.params;
  try {
    const updated = await editTrainer(
      publicId,
      req.body,
      { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name }
    );
    if (!updated) return res.status(404).json({ error: 'Trainer not found.' });
    return res.status(200).json({ success: true, trainer: updated });
  } catch (err) {
    if (err.message.includes('required') || err.message.includes('Select') || err.message.includes('Invalid status')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('updateTrainerController error:', err);
    return res.status(500).json({ error: 'Failed to update trainer.' });
  }
};

// 
// DELETE /api/admin/trainers/:publicId
// => Soft delete only - sets deleted_at, never removes the row
// 
export const deleteTrainerController = async (req, res) => {
  const { publicId } = req.params;
  const { remarks } = req.body;
  try {
    const deleted = await deleteTrainer(
      publicId,
      remarks,
      { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name }
    );
    if (!deleted) return res.status(404).json({ error: 'Trainer not found or already deleted.' });
    return res.status(200).json({ success: true, trainer: deleted });
  } catch (err) {
    // => Catches the "Remarks are required..." validation error from the service
    if (err.message.includes('required')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('deleteTrainerController error:', err);
    return res.status(500).json({ error: 'Failed to delete trainer.' });
  }
};

// 
// POST /api/admin/trainers/:publicId/restore
// 
export const restoreTrainerController = async (req, res) => {
  const { publicId } = req.params;
  try {
    const restored = await restoreTrainerService(
      publicId,
      { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name }
    );
    if (!restored) return res.status(404).json({ error: 'Trainer not found or not deleted.' });
    return res.status(200).json({ success: true, trainer: restored });
  } catch (err) {
    console.error('restoreTrainerController error:', err);
    return res.status(500).json({ error: 'Failed to restore trainer.' });
  }
};
