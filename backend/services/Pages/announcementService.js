// => services/Pages/announcementService.js
// => Validation + sanitization live here, models stay pure SQL

import * as announcementModel from '../../models/Pages/announcementModel.js';
import { sanitizeEditorHtml, isEffectivelyEmptyHtml } from './htmlSanitizer.js';
import { pool } from '../../config/db.js'; // => same relative path announcementModel.js uses, needed to pass into logActivity
import { logActivity } from '../../models/adminActivityLogModel.js'; // => top-level activity log model, not under models/Pages

export async function listAnnouncements() {
  return announcementModel.getAllAnnouncements();
}

export async function createAnnouncement({ title, message, is_active, created_by }) {
  const cleanTitle = (title || '').trim();
  const cleanMessage = sanitizeEditorHtml(message);

  if (!cleanTitle) throw { status: 400, message: 'Title is required.' };
  if (isEffectivelyEmptyHtml(cleanMessage)) throw { status: 400, message: 'Message is required.' };

  const announcement = await announcementModel.insertAnnouncement({
    title: cleanTitle,
    message: cleanMessage,
    is_active: Boolean(is_active),
    created_by,
  });

  // => logActivity swallows its own errors internally, so a logging failure here can never block the create response
  await logActivity(pool, {
    entity_type: 'announcements',
    entity_id: announcement.announcement_id,
    actor_type: 'Staff',
    actor_id: announcement.created_by,
    actor_name: announcement.created_by_name, // => already returned by insertAnnouncement's join, no extra query needed
    action: 'CREATE', // => same string value as ACTIVITY_ACTIONS.CREATE
    action_detail: `Created announcement "${announcement.title}"`,
  });

  return announcement;
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

export async function deleteAnnouncement(publicId, { deleted_by, deleted_by_name } = {}) { // => actor info now comes from the controller, this function had no way to know who deleted before
  const deleted = await announcementModel.deleteAnnouncementById(publicId);
  if (!deleted) throw { status: 404, message: 'Announcement not found.' };

  // => logActivity swallows its own errors internally, so a logging failure here can never block the delete response
  await logActivity(pool, {
    entity_type: 'announcements',
    entity_id: deleted.announcement_id,
    actor_type: 'Staff',
    actor_id: deleted_by,
    actor_name: deleted_by_name,
    action: 'DELETE', // => same string value as ACTIVITY_ACTIONS.DELETE
    action_detail: `Deleted announcement "${deleted.title}"`,
  });

  return deleted;
}