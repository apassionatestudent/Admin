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
    // => whole admin object passed through now, not just admin_id -
    //    the activity log needs a human-readable actor_name too
    const page = await cmsPageService.savePrivacyPolicy(content, req.admin);
    res.json({ page });
  } catch (err) {
    console.error('Failed to save privacy policy:', err);
    res.status(500).json({ error: 'Failed to save privacy policy.' });
  }
}

export async function getPrivacyPolicyRevisions(req, res) {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 5;
    const result = await cmsPageService.getPrivacyPolicyRevisions(page, pageSize);
    res.json(result);
  } catch (err) {
    console.error('Failed to fetch privacy policy revisions:', err);
    res.status(500).json({ error: 'Failed to fetch privacy policy revisions.' });
  }
}