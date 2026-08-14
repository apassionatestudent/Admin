// config/geminiChatbot.js
// => Central place for the Gemini API key and model settings, so nothing
//    else in the codebase reads process.env.GEMINI_API_KEY directly.
// => Not imported into server.js yet - the admin CRUD in this pass never
//    calls Gemini. This gets wired up when the public/student-facing
//    send-message endpoint is built.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// => gemini-2.5-flash was cut off from new API keys around mid-2026.
//    gemini-3.5-flash-lite is the current cheapest GA model, well suited
//    to a support/FAQ-style chatbot. Pinned to an explicit version
//    rather than an alias like gemini-flash-latest, since aliases can
//    point to experimental models not meant for production.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// => Fail fast wherever this file actually gets imported, rather than a
//    confusing 401 the first time a student opens the chat widget
if (!GEMINI_API_KEY) {
    console.error('Missing GEMINI_API_KEY in environment variables.');
    process.exit(1);
}

export { GEMINI_API_KEY, GEMINI_MODEL, GEMINI_BASE_URL };