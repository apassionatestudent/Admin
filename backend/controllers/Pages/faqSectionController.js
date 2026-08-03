// => controllers/Pages/faqSectionController.js

import * as faqSectionService from '../../services/Pages/faqSectionService.js';

export async function getSections(req, res) {
  try {
    const sections = await faqSectionService.listSections();
    res.json({ sections });
  } catch (err) {
    console.error('Failed to fetch FAQ sections:', err);
    res.status(500).json({ error: 'Failed to fetch FAQ sections.' });
  }
}

export async function createSection(req, res) {
  try {
    const { name } = req.body;
    const section = await faqSectionService.createSection({ name, created_by: req.admin.admin_id });
    res.status(201).json({ section });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Failed to create FAQ section:', err);
    res.status(500).json({ error: 'Failed to create FAQ section.' });
  }
}

export async function deleteSection(req, res) {
  try {
    await faqSectionService.deleteSection(req.params.publicId);
    res.json({ success: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Failed to delete FAQ section:', err);
    res.status(500).json({ error: 'Failed to delete FAQ section.' });
  }
}