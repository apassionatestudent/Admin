// => services/Pages/cmsPageService.js
// => Validation + sanitization live here, model stays pure SQL - same
//    split as announcementService.js

import * as cmsPageModel from '../../models/Pages/cmsPageModel.js';
import { sanitizeEditorHtml } from './htmlSanitizer.js';

const PRIVACY_POLICY_SLUG = 'privacy-policy';

export async function getPrivacyPolicy() {
  const page = await cmsPageModel.getPageBySlug(PRIVACY_POLICY_SLUG);
  // => No row yet (never saved) - return an empty shell instead of null,
  //    so the frontend always has a consistent shape to render
  if (!page) {
    return { slug: PRIVACY_POLICY_SLUG, content: '', updated_by: null, updated_at: null };
  }
  return page;
}

export async function savePrivacyPolicy(content, updatedBy) {
  const cleanContent = sanitizeEditorHtml(content);
  // => Empty Privacy Policy IS allowed on purpose - unlike Announcements,
  //    an admin might legitimately want to blank it out temporarily while
  //    rewriting it, without that being an error
  return cmsPageModel.upsertPageBySlug(PRIVACY_POLICY_SLUG, {
    content: cleanContent,
    updated_by: updatedBy,
  });
}