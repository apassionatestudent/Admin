// services/Chatbots/chatbotGeminiService.js
// => Handles the Gemini API call itself. Used right now by the admin
//    "Test" button - the public/student-facing send-message service will
//    be its own copy of this file in the other codebase, per the
//    no-shared-code policy between the two PERN apps.

import { GEMINI_API_KEY, GEMINI_MODEL, GEMINI_BASE_URL } from '../../config/geminiChatbot.js';
import sanitizeHtml from 'sanitize-html';

// => Fixed formatting rule appended to every bot's system prompt, so
//    individual admins don't need to remember to type this into every
//    Instructions field by hand. Markdown renders as literal asterisks in
//    a plain chat bubble, HTML does not.
const HTML_FORMATTING_DIRECTIVE = `Formatting rules for every reply:
- Respond using only these HTML tags: <p>, <br>, <b>, <strong>, <i>, <em>, <ul>, <ol>, <li>, <a href="...">.
- Never use Markdown syntax such as **bold** or "- item" bullet lists - use the HTML equivalents instead.
- Do not wrap the response in <html>, <head>, or <body> tags - just the inline content itself.
- Keep responses concise, this is a chat widget, not a document.`;

// => Only these tags/attributes survive - anything else Gemini emits gets
//    stripped rather than rendered, same defensive posture as the Pages
//    module's WYSIWYG sanitization
const ALLOWED_REPLY_TAGS = ['p', 'br', 'b', 'strong', 'i', 'em', 'ul', 'ol', 'li', 'a'];
const ALLOWED_REPLY_ATTRIBUTES = { a: ['href', 'target', 'rel'] };

// => Combines the two admin-editable fields (Instruction/Context, per the
//    prompt-engineering split) into one system instruction block for the
//    actual API call
function buildSystemPrompt(instructions, context) {
    const parts = [instructions];
    if (context) parts.push(`Context:\n${context}`);
    parts.push(HTML_FORMATTING_DIRECTIVE);
    return parts.join('\n\n');
}

// => messages: [{ role: 'user' | 'model', text: string }, ...] - sent in
//    full on every call since nothing is persisted server-side, matching
//    the "gone once the session closes" requirement
export async function sendMessageToGemini({ instructions, context, messages }) {
    const systemPrompt = buildSystemPrompt(instructions, context);

    const contents = messages.map((m) => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.text }],
    }));

    const url = `${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error('Gemini API error:', response.status, errorBody);
        const error = new Error('The chatbot failed to respond. Please try again.');
        error.statusCode = 502;
        throw error;
    }

    const data = await response.json();
    // => Optional chaining is deliberate - a safety-filtered prompt can
    //    return with no candidates at all
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
        const error = new Error('The chatbot did not return a response. It may have been blocked by safety filters.');
        error.statusCode = 502;
        throw error;
    }

    // => Gemini is instructed to output HTML, but never trust a model's
    //    output directly - strip anything outside the allowed tag set
    //    before this ever reaches a frontend
    return sanitizeHtml(reply, {
        allowedTags: ALLOWED_REPLY_TAGS,
        allowedAttributes: ALLOWED_REPLY_ATTRIBUTES,
        allowedSchemes: ['http', 'https'],
    });
}