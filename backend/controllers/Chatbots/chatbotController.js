// controllers/Chatbots/chatbotController.js
// => Thin HTTP layer only - parses req, calls the service, sends the
//    response. No SQL or validation logic lives here.

import {
    listChatbotsService,
    getChatbotDetailService,
    createChatbotService,
    updateChatbotService,
    deleteChatbotService,
    testChatbotMessageService,
} from '../../services/Chatbots/chatbotService.js';

export async function listChatbots(req, res) {
    try {
        const chatbots = await listChatbotsService();
        res.status(200).json({ data: chatbots });
    } catch (error) {
        console.error('Failed to list chatbots:', error);
        res.status(500).json({ message: 'Failed to load chatbots.' });
    }
}

export async function getChatbotDetail(req, res) {
    try {
        const chatbot = await getChatbotDetailService(req.params.publicId);
        res.status(200).json({ data: chatbot });
    } catch (error) {
        console.error('Failed to fetch chatbot detail:', error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to load chatbot.' });
    }
}

export async function createChatbot(req, res) {
    try {
        // => req.admin is the decoded JWT payload from protectAdmin,
        //    signed with admin_id (snake_case), not adminId - full_name
        //    is passed through for the activity log's actor_name
        const chatbot = await createChatbotService(req.body, req.admin.admin_id, req.admin.full_name);
        res.status(201).json({ data: chatbot });
    } catch (error) {
        console.error('Failed to create chatbot:', error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to create chatbot.' });
    }
}

export async function updateChatbot(req, res) {
    try {
        // => req.admin.admin_id is the authenticated admin, used to stamp
        //    updated_by - never trust an updated_by from req.body
        const chatbot = await updateChatbotService(req.params.publicId, req.body, req.admin.admin_id);
        res.status(200).json({ data: chatbot });
    } catch (error) {
        console.error('Failed to update chatbot:', error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to update chatbot.' });
    }
}

export async function deleteChatbot(req, res) {
    try {
        await deleteChatbotService(req.params.publicId, req.admin.admin_id, req.admin.full_name);
        res.status(200).json({ message: 'Chatbot deleted successfully.' });
    } catch (error) {
        console.error('Failed to delete chatbot:', error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to delete chatbot.' });
    }
}

export async function testChatbotMessage(req, res) {
    try {
        const reply = await testChatbotMessageService(req.params.publicId, req.body.messages);
        res.status(200).json({ reply });
    } catch (error) {
        console.error('Failed to send test message:', error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to send test message.' });
    }
}