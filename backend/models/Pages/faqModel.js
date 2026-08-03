// => models/Pages/faqModel.js
// => Raw SQL for faqs. Joins to faqs_sections to expose the section's
//    public_id under the "section_id" key - the frontend never sees the
//    internal integer id, only public UUIDs.

import { pool } from '../../config/db.js';

export async function getAllFaqs() {
  const { rows } = await pool.query(
    `SELECT f.faq_id, f.public_id, s.public_id AS section_id, f.question, f.answer,
            f.sort_order, f.created_by, f.created_at, f.updated_at
     FROM faqs f
     JOIN faqs_sections s ON f.section_id = s.section_id
     ORDER BY f.sort_order, f.created_at`
  );
  return rows;
}

export async function insertFaq({ section_internal_id, question, answer, created_by }) {
  const { rows } = await pool.query(
    `INSERT INTO faqs (section_id, question, answer, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING faq_id, public_id, question, answer, sort_order, created_at, updated_at`,
    [section_internal_id, question, answer, created_by]
  );
  return rows[0];
}

export async function updateFaqByPublicId(publicId, { section_internal_id, question, answer }) {
  const { rows } = await pool.query(
    `UPDATE faqs
     SET section_id = $1, question = $2, answer = $3, updated_at = now()
     WHERE public_id = $4
     RETURNING faq_id, public_id, question, answer, sort_order, created_at, updated_at`,
    [section_internal_id, question, answer, publicId]
  );
  return rows[0] || null;
}

export async function deleteFaqByPublicId(publicId) {
  const { rows } = await pool.query(
    `DELETE FROM faqs WHERE public_id = $1 RETURNING faq_id`,
    [publicId]
  );
  return rows[0] || null;
}