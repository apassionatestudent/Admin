// routes/Chatbots/chatbotRoutes.js

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
import { adminApiRateLimit } from '../../middleware/adminRateLimit.js';
import {
    listChatbots,
    getChatbotDetail,
    createChatbot,
    updateChatbot,
    deleteChatbot,
    testChatbotMessage,
} from '../../controllers/Chatbots/chatbotController.js';

const router = express.Router();

// => Rate limiter must run before protectAdmin so throttling fires before
//    JWT verification, not after
router.use(adminApiRateLimit);
router.use(protectAdmin, requireSection('chatbots'));

router.get('/', listChatbots);
router.get('/:publicId', getChatbotDetail);
router.post('/', createChatbot);
router.patch('/:publicId', updateChatbot);
router.delete('/:publicId', deleteChatbot);
router.post('/:publicId/test-message', testChatbotMessage);

export default router;