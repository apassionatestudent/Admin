// => models/Pages/faqModel.js
// => Raw SQL for faqs. Joins to faqs_sections to expose the section's
//    public_id under the "section_id" key - the frontend never sees the
//    internal integer id, only public UUIDs. Also joins to admins TWICE
//    (aliased c/u) for created_by_name / updated_by_name, same pattern
//    as announcementModel.js.

import { pool } from '../../config/db.js';

export async function getAllFaqs() {
  const { rows } = await pool.query(
    `SELECT f.faq_id, f.public_id, s.public_id AS section_id, f.question, f.answer,
            f.sort_order,
            f.created_by, c.full_name AS created_by_name,
            f.updated_by, u.full_name AS updated_by_name,
            f.created_at, f.updated_at
     FROM faqs f
     JOIN faqs_sections s ON f.section_id = s.section_id
     JOIN admins c ON c.admin_id = f.created_by
     LEFT JOIN admins u ON u.admin_id = f.updated_by
     ORDER BY f.sort_order, f.created_at`
  );
  return rows;
}

// => updated_by set to created_by on insert, same reasoning as
//    announcementModel.js's insertAnnouncement. Wrapped in a CTE so this
//    response already carries created_by_name/updated_by_name - the
//    section's public_id is added back on top in faqService.js after
//    this returns, same as before.
export async function insertFaq({ section_internal_id, question, answer, created_by }) {
  const { rows } = await pool.query(
    `WITH inserted AS (
       INSERT INTO faqs (section_id, question, answer, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $4)
       RETURNING *
     )
     SELECT i.faq_id, i.public_id, i.question, i.answer, i.sort_order,
            i.created_by, c.full_name AS created_by_name,
            i.updated_by, u.full_name AS updated_by_name,
            i.created_at, i.updated_at
     FROM inserted i
     JOIN admins c ON c.admin_id = i.created_by
     LEFT JOIN admins u ON u.admin_id = i.updated_by`,
    [section_internal_id, question, answer, created_by]
  );
  return rows[0];
}

// => CTE wrapper is the actual fix for the "still have to refresh" bug -
//    a plain UPDATE...RETURNING can't also pull updated_by_name from
//    admins. This joins the freshly-updated row against admins in the
//    same query, so the modal has the new name immediately.
export async function updateFaqByPublicId(publicId, { section_internal_id, question, answer, updated_by }) {
  const { rows } = await pool.query(
    `WITH updated AS (
       UPDATE faqs
       SET section_id = $1, question = $2, answer = $3, updated_by = $4, updated_at = now()
       WHERE public_id = $5
       RETURNING *
     )
     SELECT f.faq_id, f.public_id, f.question, f.answer, f.sort_order,
            f.created_by, c.full_name AS created_by_name,
            f.updated_by, u.full_name AS updated_by_name,
            f.created_at, f.updated_at
     FROM updated f
     JOIN admins c ON c.admin_id = f.created_by
     LEFT JOIN admins u ON u.admin_id = f.updated_by`,
    [section_internal_id, question, answer, updated_by, publicId]
  );
  return rows[0] || null;
}

export async function deleteFaqByPublicId(publicId) {
  // => Also return question so the service layer can write a readable
  //    activity log entry without a second query
  const { rows } = await pool.query(
    `DELETE FROM faqs WHERE public_id = $1 RETURNING faq_id, question`,
    [publicId]
  );
  return rows[0] || null;
}