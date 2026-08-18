// => services/Pages/faqService.js

import * as faqModel from '../../models/Pages/faqModel.js';
import * as faqSectionModel from '../../models/Pages/faqSectionModel.js';
import { sanitizeEditorHtml, isEffectivelyEmptyHtml } from './htmlSanitizer.js';

export async function listFaqs() {
  return faqModel.getAllFaqs();
}

async function resolveSectionInternalId(sectionPublicId) {
  const internalId = await faqSectionModel.getSectionInternalIdByPublicId(sectionPublicId);
  if (!internalId) throw { status: 400, message: 'Invalid section.' };
  return internalId;
}

export async function createFaq({ section_id, question, answer, created_by }) {
  const cleanQuestion = (question || '').trim();
  const cleanAnswer = sanitizeEditorHtml(answer);

  if (!cleanQuestion) throw { status: 400, message: 'Question is required.' };
  if (isEffectivelyEmptyHtml(cleanAnswer)) throw { status: 400, message: 'Answer is required.' };

  const sectionInternalId = await resolveSectionInternalId(section_id);
  const faq = await faqModel.insertFaq({
    section_internal_id: sectionInternalId,
    question: cleanQuestion,
    answer: cleanAnswer,
    created_by,
  });
  // => Echo the section's public_id back on the row - the model only
  //    ever deals in the internal id, the frontend only ever deals in
  //    public_ids
  return { ...faq, section_id };
}

export async function updateFaq(publicId, { section_id, question, answer, updated_by }) {
  const cleanQuestion = (question || '').trim();
  const cleanAnswer = sanitizeEditorHtml(answer);

  if (!cleanQuestion) throw { status: 400, message: 'Question is required.' };
  if (isEffectivelyEmptyHtml(cleanAnswer)) throw { status: 400, message: 'Answer is required.' };

  const sectionInternalId = await resolveSectionInternalId(section_id);
  const updated = await faqModel.updateFaqByPublicId(publicId, {
    section_internal_id: sectionInternalId,
    question: cleanQuestion,
    answer: cleanAnswer,
    updated_by,
  });
  if (!updated) throw { status: 404, message: 'FAQ not found.' };
  return { ...updated, section_id };
}

export async function deleteFaq(publicId) {
  const deleted = await faqModel.deleteFaqByPublicId(publicId);
  if (!deleted) throw { status: 404, message: 'FAQ not found.' };
  return deleted;
}