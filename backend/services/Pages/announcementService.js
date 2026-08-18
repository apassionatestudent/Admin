// => services/Pages/announcementService.js
// => Validation + sanitization live here, models stay pure SQL

import * as announcementModel from '../../models/Pages/announcementModel.js';
import { sanitizeEditorHtml, isEffectivelyEmptyHtml } from './htmlSanitizer.js';

export async function listAnnouncements() {
  return announcementModel.getAllAnnouncements();
}

export async function createAnnouncement({ title, message, is_active, created_by }) {
  const cleanTitle = (title || '').trim();
  const cleanMessage = sanitizeEditorHtml(message);

  if (!cleanTitle) throw { status: 400, message: 'Title is required.' };
  if (isEffectivelyEmptyHtml(cleanMessage)) throw { status: 400, message: 'Message is required.' };

  return announcementModel.insertAnnouncement({
    title: cleanTitle,
    message: cleanMessage,
    is_active: Boolean(is_active),
    created_by,
  });
}

export async function updateAnnouncement(publicId, { title, message, is_active, updated_by }) {
  const cleanTitle = (title || '').trim();
  const cleanMessage = sanitizeEditorHtml(message);

  if (!cleanTitle) throw { status: 400, message: 'Title is required.' };
  if (isEffectivelyEmptyHtml(cleanMessage)) throw { status: 400, message: 'Message is required.' };

  const updated = await announcementModel.updateAnnouncementById(publicId, {
    title: cleanTitle,
    message: cleanMessage,
    is_active: Boolean(is_active),
    updated_by,
  });
  if (!updated) throw { status: 404, message: 'Announcement not found.' };
  return updated;
}

export async function toggleAnnouncementActive(publicId, isActive, updatedBy) {
  const updated = await announcementModel.toggleAnnouncementActiveById(publicId, Boolean(isActive), updatedBy);
  if (!updated) throw { status: 404, message: 'Announcement not found.' };
  return updated;
}

export async function deleteAnnouncement(publicId) {
  const deleted = await announcementModel.deleteAnnouncementById(publicId);
  if (!deleted) throw { status: 404, message: 'Announcement not found.' };
  return deleted;
}