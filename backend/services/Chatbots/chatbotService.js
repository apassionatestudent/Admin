// services/Chatbots/chatbotService.js
// => Validation and business rules. Controllers only ever call these
//    functions, never the model directly.

import {
    findAllChatbots,
    findChatbotByPublicId,
    findChatbotsByScopeAndCourse,
    insertChatbot,
    updateChatbotByPublicId,
    deleteChatbotByPublicId,
} from '../../models/Chatbots/chatbotModel.js';
import { sendMessageToGemini } from './chatbotGeminiService.js';
// => Logging only, not the chatbot's own CRUD queries - pool is passed
//    through since logActivity takes it as its first argument, same
//    pattern used by every other logged module
import { pool } from '../../config/db.js';
import { logActivity } from '../../models/adminActivityLogModel.js';
import { ACTIVITY_ACTIONS } from '../../constants/activityActions.js';

// => student_dashboard scope removed from selectable options per admin
//    request - only these three remain
const ALLOWED_SCOPE_TYPES = ['public_site', 'tesda_course', 'shs_course'];
const COURSE_SCOPE_TYPES = ['tesda_course', 'shs_course'];
const ALLOWED_STATUSES = ['active', 'inactive'];

// => PATCH column whitelist - column names can't be parameterized, so
//    this is a hard security requirement, not just convenience
const PATCHABLE_COLUMNS = {
    name: 'name',
    widgetHeaderTitle: 'widget_header_title',
    welcomeMessage: 'welcome_message',
    instructions: 'instructions',
    context: 'context',
    scopeType: 'scope_type',
    courseId: 'course_id',
    status: 'status',
};

function buildPartialUpdate(fields) {
    const setParts = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, column] of Object.entries(PATCHABLE_COLUMNS)) {
        if (Object.prototype.hasOwnProperty.call(fields, key)) {
            setParts.push(`${column} = $${paramIndex}`);
            values.push(fields[key]);
            paramIndex += 1;
        }
    }

    return { setClause: setParts.join(', '), values };
}

// => Course-scoped bots require a course_id, other scopes must not have
//    one - throws a 400 if the pairing is invalid
function validateScopeAndCourse(scopeType, courseId) {
    if (!ALLOWED_SCOPE_TYPES.includes(scopeType)) {
        const error = new Error('Invalid scope type.');
        error.statusCode = 400;
        throw error;
    }

    const requiresCourse = COURSE_SCOPE_TYPES.includes(scopeType);
    if (requiresCourse && !courseId) {
        const error = new Error('A course must be selected for a course-scoped chatbot.');
        error.statusCode = 400;
        throw error;
    }
    if (!requiresCourse && courseId) {
        const error = new Error('Course selection only applies to TESDA or SHS course scopes.');
        error.statusCode = 400;
        throw error;
    }
}

// => Enforces one chatbot per scope regardless of status - this is the
//    real security boundary, since dropdown filtering on the frontend
//    only stops accidental duplicates, not a direct API call
async function ensureScopeAvailable(scopeType, courseId, excludePublicId = null) {
    const matches = await findChatbotsByScopeAndCourse(scopeType, courseId);
    const conflict = matches.find((m) => m.public_id !== excludePublicId);
    if (conflict) {
        const error = new Error('A chatbot already exists for this scope, whether active or inactive. Only one chatbot is allowed per scope.');
        error.statusCode = 409;
        throw error;
    }
}

// => Postgres 23505 = unique_violation, thrown by the three partial
//    indexes when activating a second bot for the same scope/course
function rethrowIfActiveScopeConflict(err) {
    if (err.code === '23505') {
        const error = new Error('An active chatbot already exists for this scope. Deactivate it first.');
        error.statusCode = 409;
        throw error;
    }
    throw err;
}

export async function listChatbotsService() {
    return findAllChatbots();
}

export async function getChatbotDetailService(publicId) {
    const chatbot = await findChatbotByPublicId(publicId);
    if (!chatbot) {
        const error = new Error('Chatbot not found');
        error.statusCode = 404;
        throw error;
    }
    return chatbot;
}

export async function createChatbotService(payload, adminId, adminName) {
    const { name, widgetHeaderTitle, welcomeMessage, instructions, context, scopeType, courseId } = payload;

    if (!name?.trim() || !widgetHeaderTitle?.trim() || !welcomeMessage?.trim() || !instructions?.trim()) {
        const error = new Error('Name, widget header title, welcome message, and instructions are all required.');
        error.statusCode = 400;
        throw error;
    }

    validateScopeAndCourse(scopeType, courseId);
    // => Blocks duplicate scopes regardless of active/inactive status,
    //    on top of the DB-level partial unique indexes which only guard
    //    active bots
    await ensureScopeAvailable(scopeType, courseId);

    // => New bots always start inactive - they need to pass a Test first
    try {
        const chatbot = await insertChatbot({
            name: name.trim(),
            widgetHeaderTitle: widgetHeaderTitle.trim(),
            welcomeMessage: welcomeMessage.trim(),
            instructions: instructions.trim(),
            context: context?.trim() || null,
            scopeType,
            courseId: courseId || null,
            createdBy: adminId,
        });

        // => entity_id here is chatbot_id, not public_id - matches the
        //    convention used by every other entity_type in activity_logs
        await logActivity(pool, {
            entity_type: 'chatbot',
            entity_id: chatbot.chatbot_id,
            actor_type: 'Staff',
            actor_id: adminId,
            actor_name: adminName,
            action: ACTIVITY_ACTIONS.CREATE,
            action_detail: `Created chatbot "${chatbot.name}"`,
        });

        return chatbot;
    } catch (err) {
        rethrowIfActiveScopeConflict(err);
    }
}

export async function updateChatbotService(publicId, fields, adminId) {
    if (fields.status && !ALLOWED_STATUSES.includes(fields.status)) {
        const error = new Error('Invalid status. Must be active or inactive.');
        error.statusCode = 400;
        throw error;
    }

    // => Only re-validate scope/course pairing if either was actually sent
    if (fields.scopeType || Object.prototype.hasOwnProperty.call(fields, 'courseId')) {
        const existing = await getChatbotDetailService(publicId);
        const scopeType = fields.scopeType || existing.scope_type;
        const courseId = Object.prototype.hasOwnProperty.call(fields, 'courseId') ? fields.courseId : existing.course_id;
        validateScopeAndCourse(scopeType, courseId);
        // => excludePublicId lets the bot being edited keep its own scope
        //    without tripping the duplicate check on itself
        await ensureScopeAvailable(scopeType, courseId, publicId);
    }

    const { setClause, values } = buildPartialUpdate(fields);
    if (!setClause) {
        const error = new Error('No valid fields provided to update.');
        error.statusCode = 400;
        throw error;
    }

    try {
        // => adminId comes from the controller (req.admin.admin_id), stamped
        //    as updated_by inside the model, not part of PATCHABLE_COLUMNS
        const updated = await updateChatbotByPublicId(publicId, setClause, values, adminId);
        if (!updated) {
            const error = new Error('Chatbot not found');
            error.statusCode = 404;
            throw error;
        }
        return updated;
    } catch (err) {
        rethrowIfActiveScopeConflict(err);
    }
}

export async function deleteChatbotService(publicId, adminId, adminName) {
    // => Name is grabbed before the row is gone so action_detail can still
    //    say what was deleted - deleteChatbotByPublicId's RETURNING only
    //    gives back chatbot_id, not name
    const existing = await getChatbotDetailService(publicId);

    const deleted = await deleteChatbotByPublicId(publicId);
    if (!deleted) {
        const error = new Error('Chatbot not found');
        error.statusCode = 404;
        throw error;
    }

    await logActivity(pool, {
        entity_type: 'chatbot',
        entity_id: deleted.chatbot_id,
        actor_type: 'Staff',
        actor_id: adminId,
        actor_name: adminName,
        action: ACTIVITY_ACTIONS.DELETE,
        action_detail: `Deleted chatbot "${existing.name}"`,
    });

    return deleted;
}

// => Powers the admin "Test" button. Looks up the bot's stored
// => instructions/context and forwards the conversation to Gemini -
// => nothing about this call is persisted, matching the no-storage rule
export async function testChatbotMessageService(publicId, messages) {
    const chatbot = await getChatbotDetailService(publicId);

    if (!Array.isArray(messages) || messages.length === 0) {
        const error = new Error('At least one message is required.');
        error.statusCode = 400;
        throw error;
    }

    const reply = await sendMessageToGemini({
        instructions: chatbot.instructions,
        context: chatbot.context,
        messages,
    });

    return reply;
}