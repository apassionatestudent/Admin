// models/Chatbots/chatbotModel.js
// => Raw SQL only. No business logic or validation here - that belongs
//    in chatbotService.js.

import { pool } from '../../config/db.js';

export async function findAllChatbots() {
    // => course_id is polymorphic (see chatbots table comment), so the
    //    join target depends on scope_type - two LEFT JOINs, each scoped
    //    to its own condition, with only one ever actually matching per row.
    // => tesda_courses has no certification_type column directly - it's a
    //    second hop through national_certification_types via certification_id,
    //    same shape as the courses list endpoint resolves it.
    const result = await pool.query(
        `SELECT
            c.chatbot_id, c.public_id, c.name, c.widget_header_title, c.welcome_message,
            c.instructions, c.context, c.scope_type, c.course_id, c.status, c.created_at, c.updated_at,
            CASE c.scope_type
                WHEN 'tesda_course' THEN tc.title
                WHEN 'shs_course' THEN sc.title
                ELSE NULL
            END AS course_title,
            CASE c.scope_type
                WHEN 'tesda_course' THEN nct.certification_type
                WHEN 'shs_course' THEN sc.grade_level
                ELSE NULL
            END AS course_level
         FROM chatbots c
         LEFT JOIN tesda_courses tc ON c.scope_type = 'tesda_course' AND c.course_id = tc.course_id
         LEFT JOIN national_certification_types nct ON tc.certification_id = nct.certification_id
         LEFT JOIN shs_courses sc ON c.scope_type = 'shs_course' AND c.course_id = sc.course_id
         ORDER BY c.created_at DESC`
    );
    return result.rows;
}

export async function findChatbotByPublicId(publicId) {
    const result = await pool.query(
        `SELECT chatbot_id, public_id, name, widget_header_title, welcome_message,
                instructions, context, scope_type, course_id, status, created_by, created_at, updated_at
         FROM chatbots
         WHERE public_id = $1`,
        [publicId]
    );
    return result.rows[0] || null;
}

export async function insertChatbot({ name, widgetHeaderTitle, welcomeMessage, instructions, context, scopeType, courseId, createdBy }) {
    const result = await pool.query(
        `INSERT INTO chatbots
            (name, widget_header_title, welcome_message, instructions, context, scope_type, course_id, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'inactive', $8)
         RETURNING chatbot_id, public_id, name, widget_header_title, welcome_message,
                   instructions, context, scope_type, course_id, status, created_at, updated_at`,
        [name, widgetHeaderTitle, welcomeMessage, instructions, context || null, scopeType, courseId || null, createdBy]
    );
    return result.rows[0];
}

export async function updateChatbotByPublicId(publicId, setClause, values) {
    const result = await pool.query(
        `UPDATE chatbots
         SET ${setClause}, updated_at = NOW()
         WHERE public_id = $${values.length + 1}
         RETURNING chatbot_id, public_id, name, widget_header_title, welcome_message,
                   instructions, context, scope_type, course_id, status, created_at, updated_at`,
        [...values, publicId]
    );
    return result.rows[0] || null;
}

export async function deleteChatbotByPublicId(publicId) {
    const result = await pool.query(
        `DELETE FROM chatbots WHERE public_id = $1 RETURNING chatbot_id`,
        [publicId]
    );
    return result.rows[0] || null;
}