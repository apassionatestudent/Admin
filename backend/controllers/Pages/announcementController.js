// => controllers/Pages/announcementController.js
// => Thin - request/response handling only, business logic lives in the service

import * as announcementService from '../../services/Pages/announcementService.js';

export async function getAnnouncements(req, res) {
  try {
    const announcements = await announcementService.listAnnouncements();
    res.json({ announcements });
  } catch (err) {
    console.error('Failed to fetch announcements:', err);
    res.status(500).json({ error: 'Failed to fetch announcements.' });
  }
}

export async function createAnnouncement(req, res) {
  try {
    const { title, message, is_active } = req.body;
    const announcement = await announcementService.createAnnouncement({
      title,
      message,
      is_active,
      created_by: req.admin.admin_id, // => set by protectAdmin
    });
    res.status(201).json({ announcement });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Failed to create announcement:', err);
    res.status(500).json({ error: 'Failed to create announcement.' });
  }
}

export async function updateAnnouncement(req, res) {
  try {
    const { title, message, is_active } = req.body;
    const announcement = await announcementService.updateAnnouncement(req.params.publicId, {
      title,
      message,
      is_active,
    });
    res.json({ announcement });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Failed to update announcement:', err);
    res.status(500).json({ error: 'Failed to update announcement.' });
  }
}

export async function toggleAnnouncementActive(req, res) {
  try {
    const { is_active } = req.body;
    const announcement = await announcementService.toggleAnnouncementActive(req.params.publicId, is_active);
    res.json({ announcement });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Failed to toggle announcement:', err);
    res.status(500).json({ error: 'Failed to toggle announcement.' });
  }
}

export async function deleteAnnouncement(req, res) {
  try {
    await announcementService.deleteAnnouncement(req.params.publicId);
    res.json({ success: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Failed to delete announcement:', err);
    res.status(500).json({ error: 'Failed to delete announcement.' });
  }
}