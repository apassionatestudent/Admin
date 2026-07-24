// => controllers/Classes/adminFacilityController.js
// => Thin controller layer - delegates all logic to the service.

import {
  fetchActiveFacilities,
  fetchDeletedFacilities,
  addFacility,
  fetchFacilityDetail,
  editFacility,
  deleteFacility,
  restoreFacilityService,
} from '../../services/Classes/adminFacilityService.js';

// 
// GET /api/admin/facilities
// 
export const listFacilities = async (req, res) => {
  try {
    const facilities = await fetchActiveFacilities();
    return res.status(200).json({ facilities });
  } catch (err) {
    console.error('listFacilities error:', err);
    return res.status(500).json({ error: 'Failed to fetch facilities.' });
  }
};

// 
// GET /api/admin/facilities/deleted
// => Must be registered BEFORE /:publicId in the router, same rule as
//    adminClassRoute.js's /search and /form-options
// 
export const listDeletedFacilities = async (req, res) => {
  try {
    const facilities = await fetchDeletedFacilities();
    return res.status(200).json({ facilities });
  } catch (err) {
    console.error('listDeletedFacilities error:', err);
    return res.status(500).json({ error: 'Failed to fetch deleted facilities.' });
  }
};

// 
// POST /api/admin/facilities
// => Body: { name, capacity, allows_all_courses, tesda_course_ids, shs_cluster_ids }
// 
export const createFacilityController = async (req, res) => {
  try {
    const facility = await addFacility(
      { ...req.body, created_by: req.admin?.admin_id ?? null },
      { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name }
    );
    return res.status(201).json({ success: true, facility });
  } catch (err) {
    if (err.message.includes('required') || err.message.includes('Select at least')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('createFacilityController error:', err);
    return res.status(500).json({ error: 'Failed to create facility.' });
  }
};

// 
// GET /api/admin/facilities/:publicId
// 
export const getFacilityDetailController = async (req, res) => {
  const { publicId } = req.params;
  try {
    const facility = await fetchFacilityDetail(publicId);
    if (!facility) return res.status(404).json({ error: 'Facility not found.' });
    return res.status(200).json({ facility });
  } catch (err) {
    console.error('getFacilityDetailController error:', err);
    return res.status(500).json({ error: 'Failed to fetch facility.' });
  }
};

// 
// PATCH /api/admin/facilities/:publicId
// 
export const updateFacilityController = async (req, res) => {
  const { publicId } = req.params;
  try {
    const updated = await editFacility(
      publicId,
      req.body,
      { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name }
    );
    if (!updated) return res.status(404).json({ error: 'Facility not found.' });
    return res.status(200).json({ success: true, facility: updated });
  } catch (err) {
    if (err.message.includes('required') || err.message.includes('Select at least') || err.message.includes('Invalid status')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('updateFacilityController error:', err);
    return res.status(500).json({ error: 'Failed to update facility.' });
  }
};

// 
// DELETE /api/admin/facilities/:publicId
// => Soft delete only - sets deleted_at, never removes the row
// 
export const deleteFacilityController = async (req, res) => {
  const { publicId } = req.params;
  const { remarks } = req.body;
  try {
    const deleted = await deleteFacility(
      publicId,
      remarks,
      { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name }
    );
    if (!deleted) return res.status(404).json({ error: 'Facility not found or already deleted.' });
    return res.status(200).json({ success: true, facility: deleted });
  } catch (err) {
    // => Catches the "Remarks are required..." validation error from the service
    if (err.message.includes('required')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('deleteFacilityController error:', err);
    return res.status(500).json({ error: 'Failed to delete facility.' });
  }
};

// 
// POST /api/admin/facilities/:publicId/restore
// 
export const restoreFacilityController = async (req, res) => {
  const { publicId } = req.params;
  try {
    const restored = await restoreFacilityService(
      publicId,
      { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name }
    );
    if (!restored) return res.status(404).json({ error: 'Facility not found or not deleted.' });
    return res.status(200).json({ success: true, facility: restored });
  } catch (err) {
    console.error('restoreFacilityController error:', err);
    return res.status(500).json({ error: 'Failed to restore facility.' });
  }
};
