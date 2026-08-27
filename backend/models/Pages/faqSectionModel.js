// => models/Pages/faqSectionModel.js
// => Raw SQL for faqs_sections. Uses `pool`, same as announcementModel.js / cmsPageModel.js.

import { pool } from '../../config/db.js';

export async function getAllSections() {
  const { rows } = await pool.query(
    `SELECT section_id, public_id, name, sort_order, created_by, created_at
     FROM faqs_sections
     ORDER BY sort_order, created_at`
  );
  return rows;
}

export async function insertSection({ name, created_by }) {
  const { rows } = await pool.query(
    `INSERT INTO faqs_sections (name, created_by)
     VALUES ($1, $2)
     RETURNING section_id, public_id, name, sort_order, created_by, created_at`,
    [name, created_by]
  );
  return rows[0];
}

// => Resolves a section's public UUID to the internal integer id that
//    faqs.section_id's FK actually points at
export async function getSectionInternalIdByPublicId(publicId) {
  const { rows } = await pool.query(
    `SELECT section_id FROM faqs_sections WHERE public_id = $1`,
    [publicId]
  );
  return rows[0]?.section_id ?? null;
}

export async function deleteSectionByPublicId(publicId) {
  // => Also return name so the service layer can write a readable
  //    activity log entry without a second query
  const { rows } = await pool.query(
    `DELETE FROM faqs_sections WHERE public_id = $1 RETURNING section_id, name`,
    [publicId]
  );
  return rows[0] || null;
}