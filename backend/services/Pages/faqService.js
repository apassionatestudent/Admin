// => services/Pages/faqService.js

import * as faqModel from '../../models/Pages/faqModel.js';
import * as faqSectionModel from '../../models/Pages/faqSectionModel.js';
import { sanitizeEditorHtml, isEffectivelyEmptyHtml } from './htmlSanitizer.js';

// => Activity logging, CREATE and DELETE only for FAQs (UPDATE is
//    intentionally not logged for this entity). Double check these two
//    paths match where adminActivityLogModel.js and activityActions.js
//    actually live in your tree
import { pool } from '../../config/db.js';
import { logActivity } from '../../models/adminActivityLogModel.js';
import { ACTIVITY_ACTIONS } from '../../constants/activityActions.js';

export async function listFaqs() {
  return faqModel.getAllFaqs();
}

async function resolveSectionInternalId(sectionPublicId) {
  const internalId = await faqSectionModel.getSectionInternalIdByPublicId(sectionPublicId);
  if (!internalId) throw { status: 400, message: 'Invalid section.' };
  return internalId;
}

export async function createFaq({ section_id, question, answer, created_by, actor_name }) {
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

  // => Log the creation, fire-and-forget, never blocks or throws on the
  //    actual save path since logActivity swallows its own errors
  await logActivity(pool, {
    entity_type: 'faq',
    entity_id: faq.faq_id,
    actor_type: 'Staff',
    actor_id: created_by,
    actor_name,
    action: ACTIVITY_ACTIONS.CREATE,
    action_detail: `Created FAQ "${cleanQuestion}"`,
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

export async function deleteFaq(publicId, { actor_id, actor_name } = {}) {
  const deleted = await faqModel.deleteFaqByPublicId(publicId);
  if (!deleted) throw { status: 404, message: 'FAQ not found.' };

  // => Log the deletion using the question text returned by the DELETE
  //    ...RETURNING clause, no second query needed
  await logActivity(pool, {
    entity_type: 'faq',
    entity_id: deleted.faq_id,
    actor_type: 'Staff',
    actor_id,
    actor_name,
    action: ACTIVITY_ACTIONS.DELETE,
    action_detail: `Deleted FAQ "${deleted.question}"`,
  });

  return deleted;
}