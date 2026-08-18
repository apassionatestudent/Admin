// => controllers/Pages/faqController.js

import * as faqService from '../../services/Pages/faqService.js';

export async function getFaqs(req, res) {
  try {
    const faqs = await faqService.listFaqs();
    res.json({ faqs });
  } catch (err) {
    console.error('Failed to fetch FAQs:', err);
    res.status(500).json({ error: 'Failed to fetch FAQs.' });
  }
}

export async function createFaq(req, res) {
  try {
    const { section_id, question, answer } = req.body;
    const faq = await faqService.createFaq({ section_id, question, answer, created_by: req.admin.admin_id });
    res.status(201).json({ faq });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Failed to create FAQ:', err);
    res.status(500).json({ error: 'Failed to create FAQ.' });
  }
}

export async function updateFaq(req, res) {
  try {
    const { section_id, question, answer } = req.body;
    const faq = await faqService.updateFaq(req.params.publicId, {
      section_id,
      question,
      answer,
      updated_by: req.admin.admin_id, // => set by protectAdmin
    });
    res.json({ faq });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Failed to update FAQ:', err);
    res.status(500).json({ error: 'Failed to update FAQ.' });
  }
}

export async function deleteFaq(req, res) {
  try {
    await faqService.deleteFaq(req.params.publicId);
    res.json({ success: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Failed to delete FAQ:', err);
    res.status(500).json({ error: 'Failed to delete FAQ.' });
  }
}