// => models/Pages/announcementModel.js
// => Raw SQL for the `announcements` table - already live in Neon, no
//    migration needed here, just the CRUD queries.
// => Uses `pool` (pg Pool, WebSocket) per your instruction - parameterized
//    with $1/$2/... positional placeholders, results come back as { rows }.

import { pool } from '../../config/db.js'; // => matches server.js's './config/db.js', two levels up from models/Pages

export async function getAllAnnouncements() {
  const { rows } = await pool.query(`
    SELECT announcement_id, public_id, title, message, is_active, created_by, created_at, updated_at
    FROM announcements
    ORDER BY updated_at DESC
  `);
  return rows;
}

export async function getAnnouncementByPublicId(publicId) {
  const { rows } = await pool.query(
    `SELECT announcement_id, public_id, title, message, is_active, created_by, created_at, updated_at
     FROM announcements
     WHERE public_id = $1`,
    [publicId]
  );
  return rows[0] || null;
}

export async function insertAnnouncement({ title, message, is_active, created_by }) {
  const { rows } = await pool.query(
    `INSERT INTO announcements (title, message, is_active, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING announcement_id, public_id, title, message, is_active, created_by, created_at, updated_at`,
    [title, message, is_active, created_by]
  );
  return rows[0];
}

export async function updateAnnouncementById(publicId, { title, message, is_active }) {
  const { rows } = await pool.query(
    `UPDATE announcements
     SET title = $1, message = $2, is_active = $3, updated_at = now()
     WHERE public_id = $4
     RETURNING announcement_id, public_id, title, message, is_active, created_by, created_at, updated_at`,
    [title, message, is_active, publicId]
  );
  return rows[0] || null;
}

// => Separate from the generic update on purpose - mirrors your existing
//    pattern of keeping status-only flips out of the generic PATCH
//    whitelist, so a title/message edit can never accidentally also
//    silently flip visibility
export async function toggleAnnouncementActiveById(publicId, isActive) {
  const { rows } = await pool.query(
    `UPDATE announcements
     SET is_active = $1, updated_at = now()
     WHERE public_id = $2
     RETURNING announcement_id, public_id, title, message, is_active, created_by, created_at, updated_at`,
    [isActive, publicId]
  );
  return rows[0] || null;
}

// => Hard delete - Announcements don't soft-delete/restore like
//    Facilities/Trainers/Courses do
export async function deleteAnnouncementById(publicId) {
  const { rows } = await pool.query(
    `DELETE FROM announcements WHERE public_id = $1 RETURNING announcement_id`,
    [publicId]
  );
  return rows[0] || null;
}