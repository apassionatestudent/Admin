// => models/Pages/announcementModel.js
// => Raw SQL for the `announcements` table - already live in Neon, no
//    migration needed here, just the CRUD queries.
// => Uses `pool` (pg Pool, WebSocket) per your instruction - parameterized
//    with $1/$2/... positional placeholders, results come back as { rows }.

import { pool } from '../../config/db.js'; // => matches server.js's './config/db.js', two levels up from models/Pages

// => Joined to admins TWICE (aliased c/u) to pull both the creator's and
//    last-editor's names in one query - same join style faqModel.js
//    already uses for section names. LEFT JOIN on updated_by since older
//    rows saved before this column existed will have it NULL.
export async function getAllAnnouncements() {
  const { rows } = await pool.query(`
    SELECT a.announcement_id, a.public_id, a.title, a.message, a.is_active,
           a.created_by, c.full_name AS created_by_name,
           a.updated_by, u.full_name AS updated_by_name,
           a.created_at, a.updated_at
    FROM announcements a
    JOIN admins c ON c.admin_id = a.created_by
    LEFT JOIN admins u ON u.admin_id = a.updated_by
    ORDER BY a.updated_at DESC
  `);
  return rows;
}

export async function getAnnouncementByPublicId(publicId) {
  const { rows } = await pool.query(
    `SELECT a.announcement_id, a.public_id, a.title, a.message, a.is_active,
            a.created_by, c.full_name AS created_by_name,
            a.updated_by, u.full_name AS updated_by_name,
            a.created_at, a.updated_at
     FROM announcements a
     JOIN admins c ON c.admin_id = a.created_by
     LEFT JOIN admins u ON u.admin_id = a.updated_by
     WHERE a.public_id = $1`,
    [publicId]
  );
  return rows[0] || null;
}

// => updated_by set to created_by on insert - the creator is also the
//    first "updater" by definition. Wrapped in a CTE so the INSERT's
//    RETURNING can still be joined against admins for the names,
//    same reasoning as the update functions below - the frontend needs
//    created_by_name/updated_by_name in THIS response, not just on the
//    next full-list refetch.
export async function insertAnnouncement({ title, message, is_active, created_by }) {
  const { rows } = await pool.query(
    `WITH inserted AS (
       INSERT INTO announcements (title, message, is_active, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $4)
       RETURNING *
     )
     SELECT i.announcement_id, i.public_id, i.title, i.message, i.is_active,
            i.created_by, c.full_name AS created_by_name,
            i.updated_by, u.full_name AS updated_by_name,
            i.created_at, i.updated_at
     FROM inserted i
     JOIN admins c ON c.admin_id = i.created_by
     LEFT JOIN admins u ON u.admin_id = i.updated_by`,
    [title, message, is_active, created_by]
  );
  return rows[0];
}

// => CTE wrapper is the actual fix for the "still have to refresh" bug -
//    a plain UPDATE...RETURNING only returns announcements' own columns,
//    it has no way to also pull updated_by_name from admins. This joins
//    the freshly-updated row against admins in the same query, so the
//    modal has the new name immediately, no refetch needed.
export async function updateAnnouncementById(publicId, { title, message, is_active, updated_by }) {
  const { rows } = await pool.query(
    `WITH updated AS (
       UPDATE announcements
       SET title = $1, message = $2, is_active = $3, updated_by = $4, updated_at = now()
       WHERE public_id = $5
       RETURNING *
     )
     SELECT a.announcement_id, a.public_id, a.title, a.message, a.is_active,
            a.created_by, c.full_name AS created_by_name,
            a.updated_by, u.full_name AS updated_by_name,
            a.created_at, a.updated_at
     FROM updated a
     JOIN admins c ON c.admin_id = a.created_by
     LEFT JOIN admins u ON u.admin_id = a.updated_by`,
    [title, message, is_active, updated_by, publicId]
  );
  return rows[0] || null;
}

// => Separate from the generic update on purpose - mirrors your existing
//    pattern of keeping status-only flips out of the generic PATCH
//    whitelist, so a title/message edit can never accidentally also
//    silently flip visibility. Same CTE fix as updateAnnouncementById.
export async function toggleAnnouncementActiveById(publicId, isActive, updatedBy) {
  const { rows } = await pool.query(
    `WITH toggled AS (
       UPDATE announcements
       SET is_active = $1, updated_by = $2, updated_at = now()
       WHERE public_id = $3
       RETURNING *
     )
     SELECT a.announcement_id, a.public_id, a.title, a.message, a.is_active,
            a.created_by, c.full_name AS created_by_name,
            a.updated_by, u.full_name AS updated_by_name,
            a.created_at, a.updated_at
     FROM toggled a
     JOIN admins c ON c.admin_id = a.created_by
     LEFT JOIN admins u ON u.admin_id = a.updated_by`,
    [isActive, updatedBy, publicId]
  );
  return rows[0] || null;
}

// => Hard delete - Announcements don't soft-delete/restore like
//    Facilities/Trainers/Courses do
export async function deleteAnnouncementById(publicId) {
  const { rows } = await pool.query(
    `DELETE FROM announcements WHERE public_id = $1 RETURNING announcement_id, title`, // => added title, needed for the DELETE activity log's action_detail since the row won't exist to re-query afterward
    [publicId]
  );
  return rows[0] || null;
}