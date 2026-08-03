// => controllers/Pages/cmsPageController.js
// => Thin - request/response handling only, business logic lives in the service

import * as cmsPageService from '../../services/Pages/cmsPageService.js';

export async function getPrivacyPolicy(req, res) {
  try {
    const page = await cmsPageService.getPrivacyPolicy();
    res.json({ page });
  } catch (err) {
    console.error('Failed to fetch privacy policy:', err);
    res.status(500).json({ error: 'Failed to fetch privacy policy.' });
  }
}

export async function savePrivacyPolicy(req, res) {
  try {
    const { content } = req.body;
    const page = await cmsPageService.savePrivacyPolicy(content, req.admin.admin_id); // => set by protectAdmin
    res.json({ page });
  } catch (err) {
    console.error('Failed to save privacy policy:', err);
    res.status(500).json({ error: 'Failed to save privacy policy.' });
  }
}