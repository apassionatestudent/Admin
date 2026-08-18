// => services/Pages/termsPageService.js
// => Terms and Conditions - a deliberate full copy of cmsPageService.js
//    rather than a shared/generic module, so this page stays
//    independently locatable, same as how TESDA/SHS mirror each other
//    as separate files instead of one parameterized module.

import * as cmsPageModel from '../../models/Pages/cmsPageModel.js';
import { sanitizeEditorHtml } from './htmlSanitizer.js';
import { logActivity } from '../../models/adminActivityLogModel.js';
import { ACTIVITY_ACTIONS } from '../../constants/activityActions.js';
import { pool } from '../../config/db.js';

const TERMS_SLUG = 'terms-and-conditions';
const TERMS_LABEL = 'Terms and Conditions';

export async function getTermsAndConditions() {
  const page = await cmsPageModel.getPageBySlug(TERMS_SLUG);
  // => No row yet (never saved) - return an empty shell instead of null,
  //    so the frontend always has a consistent shape to render
  if (!page) {
    return { slug: TERMS_SLUG, content: '', updated_by: null, updated_at: null };
  }
  return page;
}

export async function saveTermsAndConditions(content, admin) {
  const cleanContent = sanitizeEditorHtml(content);

  const { page, wasCreate } = await cmsPageModel.saveContentWithRevision(TERMS_SLUG, {
    content: cleanContent,
    updated_by: admin.admin_id,
  });

  // => logActivity swallows its own errors internally, so a logging
  //    hiccup can never roll back the save that already committed above
  await logActivity(pool, {
    entity_type: 'cms_page',
    entity_id: page.page_id,
    actor_type: 'Staff',
    actor_id: admin.admin_id,
    actor_name: admin.full_name,
    action: wasCreate ? ACTIVITY_ACTIONS.CREATE : ACTIVITY_ACTIONS.UPDATE,
    action_detail: `${wasCreate ? 'Created' : 'Updated'} the ${TERMS_LABEL} page.`,
  });

  return page;
}

// => Paginated revision history for Terms and Conditions - resolves the
//    slug to a page_id first since cms_page_revisions is keyed by
//    page_id, not slug
export async function getTermsAndConditionsRevisions(page = 1, pageSize = 5) {
  const cmsPage = await cmsPageModel.getPageBySlug(TERMS_SLUG);
  if (!cmsPage) {
    return { revisions: [], total: 0, page, pageSize, totalPages: 0 };
  }
  return cmsPageModel.getPageRevisions(cmsPage.page_id, page, pageSize);
}