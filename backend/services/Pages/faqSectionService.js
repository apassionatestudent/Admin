// => services/Pages/faqSectionService.js

import * as faqSectionModel from '../../models/Pages/faqSectionModel.js';

// => Activity logging, CREATE and DELETE only, same reasoning as
//    faqService.js. Double check these two import paths
import { pool } from '../../config/db.js';
import { logActivity } from '../../models/adminActivityLogModel.js';
import { ACTIVITY_ACTIONS } from '../../constants/activityActions.js';

export async function listSections() {
  return faqSectionModel.getAllSections();
}

export async function createSection({ name, created_by, actor_name }) {
  const cleanName = (name || '').trim();
  if (!cleanName) throw { status: 400, message: 'Section name is required.' };
  const section = await faqSectionModel.insertSection({ name: cleanName, created_by });

  // => Log the creation, fire-and-forget same as faqService.js
  await logActivity(pool, {
    entity_type: 'faq_section',
    entity_id: section.section_id,
    actor_type: 'Staff',
    actor_id: created_by,
    actor_name,
    action: ACTIVITY_ACTIONS.CREATE,
    action_detail: `Created FAQ section "${cleanName}"`,
  });

  return section;
}

export async function deleteSection(publicId, { actor_id, actor_name } = {}) {
  try {
    const deleted = await faqSectionModel.deleteSectionByPublicId(publicId);
    if (!deleted) throw { status: 404, message: 'Section not found.' };

    // => Log the deletion using the name returned by the DELETE
    //    ...RETURNING clause, no second query needed
    await logActivity(pool, {
      entity_type: 'faq_section',
      entity_id: deleted.section_id,
      actor_type: 'Staff',
      actor_id,
      actor_name,
      action: ACTIVITY_ACTIONS.DELETE,
      action_detail: `Deleted FAQ section "${deleted.name}"`,
    });

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
