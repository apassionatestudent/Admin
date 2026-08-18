// => controllers/Pages/termsPageController.js
// => Thin - request/response handling only, business logic lives in the service

import * as termsPageService from '../../services/Pages/termsPageService.js';

export async function getTermsAndConditions(req, res) {
  try {
    const page = await termsPageService.getTermsAndConditions();
    res.json({ page });
  } catch (err) {
    console.error('Failed to fetch terms and conditions:', err);
    res.status(500).json({ error: 'Failed to fetch terms and conditions.' });
  }
}

export async function saveTermsAndConditions(req, res) {
  try {
    const { content } = req.body;
    const page = await termsPageService.saveTermsAndConditions(content, req.admin);
    res.json({ page });
  } catch (err) {
    console.error('Failed to save terms and conditions:', err);
    res.status(500).json({ error: 'Failed to save terms and conditions.' });
  }
}

export async function getTermsAndConditionsRevisions(req, res) {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 5;
    const result = await termsPageService.getTermsAndConditionsRevisions(page, pageSize);
    res.json(result);
  } catch (err) {
    console.error('Failed to fetch terms and conditions revisions:', err);
    res.status(500).json({ error: 'Failed to fetch terms and conditions revisions.' });
  }
}