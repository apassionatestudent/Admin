// => models/Pages/cmsPageModel.js
// => Raw SQL for the `cms_pages` table - single-row-per-slug pattern, so
//    Privacy Policy today, Terms of Service etc. later without a new table.
// => Uses `pool` (pg Pool), same as announcementModel.js.

import { pool } from '../../config/db.js';

export async function getPageBySlug(slug) {
  const { rows } = await pool.query(
    `SELECT page_id, slug, content, updated_by, updated_at
     FROM cms_pages
     WHERE slug = $1`,
    [slug]
  );
  return rows[0] || null;
}

// => Upsert - a slug either doesn't exist yet (first-ever save) or already
//    does (every save after that). ON CONFLICT keeps this to one query
//    instead of a separate exists-check + insert-or-update branch.
export async function upsertPageBySlug(slug, { content, updated_by }) {
  const { rows } = await pool.query(
    `INSERT INTO cms_pages (slug, content, updated_by, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (slug)
     DO UPDATE SET content = $2, updated_by = $3, updated_at = now()
     RETURNING page_id, slug, content, updated_by, updated_at`,
    [slug, content, updated_by]
  );
  return rows[0];
}