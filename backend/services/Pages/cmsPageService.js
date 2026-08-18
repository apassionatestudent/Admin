// => services/Pages/cmsPageService.js
// => Validation + sanitization live here, model stays pure SQL - same
//    split as announcementService.js

import * as cmsPageModel from '../../models/Pages/cmsPageModel.js';
import { sanitizeEditorHtml } from './htmlSanitizer.js';
import { logActivity } from '../../models/adminActivityLogModel.js';
import { ACTIVITY_ACTIONS } from '../../constants/activityActions.js'; 
import { pool } from '../../config/db.js';

const PRIVACY_POLICY_SLUG = 'privacy-policy';

// => Friendly label for activity_logs.action_detail - keyed by slug so
//    this same map covers Terms and Conditions later with no new code
const PAGE_LABELS = {
  'privacy-policy': 'Privacy Policy',
  'terms-and-conditions': 'Terms and Conditions',
};

export async function getPrivacyPolicy() {
  const page = await cmsPageModel.getPageBySlug(PRIVACY_POLICY_SLUG);
  // => No row yet (never saved) - return an empty shell instead of null,
  //    so the frontend always has a consistent shape to render
  if (!page) {
    return { slug: PRIVACY_POLICY_SLUG, content: '', updated_by: null, updated_at: null };
  }
  return page;
}

export async function savePrivacyPolicy(content, admin) {
  const cleanContent = sanitizeEditorHtml(content);
  // => Empty Privacy Policy IS allowed on purpose - unlike Announcements,
  //    an admin might legitimately want to blank it out temporarily while
  //    rewriting it, without that being an error

  const { page, wasCreate } = await cmsPageModel.saveContentWithRevision(PRIVACY_POLICY_SLUG, {
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
    action_detail: `${wasCreate ? 'Created' : 'Updated'} the ${PAGE_LABELS[PRIVACY_POLICY_SLUG]} page.`,
  });

  return page;
}

// => Paginated revision history for the Privacy Policy page - resolves
//    the slug to a page_id first since cms_page_revisions is keyed by
//    page_id, not slug
export async function getPrivacyPolicyRevisions(page = 1, pageSize = 5) {
  const cmsPage = await cmsPageModel.getPageBySlug(PRIVACY_POLICY_SLUG);
  if (!cmsPage) {
    return { revisions: [], total: 0, page, pageSize, totalPages: 0 };
  }
  return cmsPageModel.getPageRevisions(cmsPage.page_id, page, pageSize);
}