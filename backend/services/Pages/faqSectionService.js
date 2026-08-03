// => services/Pages/faqSectionService.js

import * as faqSectionModel from '../../models/Pages/faqSectionModel.js';

export async function listSections() {
  return faqSectionModel.getAllSections();
}

export async function createSection({ name, created_by }) {
  const cleanName = (name || '').trim();
  if (!cleanName) throw { status: 400, message: 'Section name is required.' };
  return faqSectionModel.insertSection({ name: cleanName, created_by });
}

export async function deleteSection(publicId) {
  try {
    const deleted = await faqSectionModel.deleteSectionByPublicId(publicId);
    if (!deleted) throw { status: 404, message: 'Section not found.' };
    return deleted;
  } catch (err) {
    // => Postgres foreign_key_violation - this section still has FAQs
    //    pointing at it (the FK on faqs.section_id blocks the delete).
    //    The frontend already checks this client-side before calling in,
    //    but this covers a race between two admins acting at the same time.
    if (err.code === '23503') {
      throw { status: 409, message: "This section still has FAQs in it. Move or delete them first." };
    }
    throw err;
  }
}