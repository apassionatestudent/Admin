// utils/sendEnrollmentStatusEmail.js

import { resend } from '../config/email.js';

// => Points at the public/student frontend - separate from ADMIN_APP_URL,
// => since this email goes to a student, not staff. Confirm this env var
// => name matches whatever your student dashboard app already uses.
const STUDENT_APP_URL = process.env.STUDENT_APP_URL || 'http://localhost:5173/';

// => Tailored content per status - only statuses actually reachable
// => through changeTesdaEnrollmentStatus / changeShsEnrollmentStatus are
// => listed here. Pending is set automatically on submission, never
// => reached through this admin function, so it has no entry.
const STATUS_CONTENT = {
  Reviewed: {
    heading: 'Your enrollment is under review',
    message: 'Our staff has reviewed your submitted documents and your application is now being processed further.',
  },
  Approved: {
    heading: 'Your enrollment has been approved',
    message: 'Congratulations! Your enrollment has been approved. Please check your dashboard for your batch schedule and next steps.',
  },
  'Needs Clarification': {
    heading: 'Action needed on your enrollment',
    message: 'We need some additional information or corrections from you before we can continue processing your enrollment.',
  },
  Rejected: {
    heading: 'Update on your enrollment application',
    message: 'After review, we are unable to approve your enrollment application at this time.',
  },
  Dropped: {
    heading: 'Your enrollment has been dropped',
    message: 'Your enrollment has been dropped from the program. If you believe this was made in error, please reach out to us.',
  },
  'For Assessment': {
    heading: 'You are scheduled for assessment',
    message: 'Your training period is complete and your balance has been cleared. You are now scheduled for assessment.',
  },
  'Failed Assessment': {
    heading: 'Assessment result update',
    message: 'Our records show that your recent assessment was not passed. Please check your dashboard or contact us for guidance on next steps.',
  },
  Reserved: {
    heading: 'Your enrollment is reserved',
    message: 'Your enrollment is currently reserved and will be assigned to an upcoming batch once one becomes available.',
  },
};

// => Formats a Postgres date/timestamp value into a readable string.
// => Returns null instead of throwing if startDate is missing or invalid,
// => so the email template can just skip the line when there's nothing to show.
function formatDate(startDate) {
  if (!startDate) return null;
  const parsed = new Date(startDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

// => Sends the enrollment status change notification to the student.
// => enrollmentType is 'TESDA' or 'SHS', purely for the label in the email body.
// => courseOrTrack is course_name for TESDA, cluster name for SHS.
export async function sendEnrollmentStatusEmail({
  toEmail,
  studentName,
  enrollmentType,
  newStatus,
  courseOrTrack,
  batchName,
  startDate,
  externalRemarks,
}) {
  const content = STATUS_CONTENT[newStatus];

  // => Unknown/unmapped status - skip sending rather than emailing a
  // => blank template. Callers already log this on the catch side.
  if (!content) {
    console.warn(`sendEnrollmentStatusEmail: no template for status "${newStatus}", skipping email.`);
    return;
  }

  const formattedDate = formatDate(startDate);

  // => Plain text wordmark, matching sendStaffInviteEmail.js and
  // => sendStaffResetPasswordEmail.js - no logo, keeps this file free of
  // => any dependency on an image being reachable at send time
  const logoHtml = `<span style="color:#ffffff; font-size:20px; font-weight:700; letter-spacing:0.02em;">PrimeEnroll Digital</span>`;

  // => Remarks block only renders when the admin actually typed something.
  const remarksHtml = externalRemarks?.trim()
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px; background-color:#f4f3ec; border-radius:8px;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 4px; font-size:12px; color:#6b6375; text-transform:uppercase; letter-spacing:0.06em;">
              Remarks from staff
            </p>
            <p style="margin:0; font-size:14px; line-height:1.6; color:#3a3540;">
              ${externalRemarks.trim()}
            </p>
          </td>
        </tr>
      </table>
    `
    : '';

  // => Batch/course detail line only renders when the values exist -
  // => a Rejected or Reserved enrollment may have no batch assigned yet.
  const detailsHtml = (courseOrTrack || batchName || formattedDate)
    ? `
      <p style="margin:0 0 24px; font-size:14px; line-height:1.7; color:#3a3540;">
        ${courseOrTrack ? `<strong>${enrollmentType === 'SHS' ? 'Track/Cluster' : 'Course'}:</strong> ${courseOrTrack}<br />` : ''}
        ${batchName ? `<strong>Batch:</strong> ${batchName}<br />` : ''}
        ${formattedDate ? `<strong>Start Date:</strong> ${formattedDate}` : ''}
      </p>
    `
    : '';

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: toEmail,
    subject: `PrimeEnroll Digital - ${content.heading}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <!-- => Best-effort web font loading - Gmail and Outlook strip this
             tag entirely and fall back to the Georgia/serif chain below,
             but Apple Mail and a few other clients will honor it -->
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Merriweather:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body style="margin:0; padding:0; background-color:#f4f5f8; font-family:'Merriweather', Georgia, 'Times New Roman', serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f8; padding:40px 0;">
          <tr>
            <td align="center">
              <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e5e4e7;">

                <!-- => Maroon header bar, matches the invite/reset email pattern -->
                <tr>
                  <td style="background-color:#660911; padding:28px 36px;">
                    ${logoHtml}
                    <div style="color:rgba(255,255,255,0.7); font-size:12px; margin-top:8px; text-transform:uppercase; letter-spacing:0.08em;">
                      ${enrollmentType} Enrollment Update
                    </div>
                  </td>
                </tr>

                <!-- => Body -->
                <tr>
                  <td style="padding:36px;">
                    <h1 style="margin:0 0 16px; font-size:22px; color:#08060d; font-weight:700; font-family:'Cormorant Garamond', Georgia, serif;">
                      Hi ${studentName},
                    </h1>
                    <p style="margin:0 0 8px; font-size:15px; font-weight:700; color:#08060d;">
                      ${content.heading}
                    </p>
                    <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:#3a3540;">
                      ${content.message}
                    </p>

                    ${detailsHtml}
                    ${remarksHtml}

                    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                      <tr>
                        <td style="border-radius:8px; background-color:#8a0d17;">
                          <a href="${STUDENT_APP_URL}dashboard/enrollment"
                             style="display:inline-block; padding:13px 28px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px;">
                            View My Dashboard
                          </a>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:0; font-size:13px; color:#6b6375; border-top:1px solid #e5e4e7; padding-top:16px;">
                      If you have questions about this update, please contact our office directly.
                    </p>
                  </td>
                </tr>

                <!-- => Footer -->
                <tr>
                  <td style="background-color:#f4f3ec; padding:20px 36px; text-align:center;">
                    <span style="font-size:12px; color:#6b6375;">
                      3A Prime Hospitality Training and Assessment Center Inc.
                    </span>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  });

  // => Same reasoning as sendStaffInviteEmail.js - Resend fails silently
  // => (returns error, doesn't throw), so this has to check explicitly.
  if (error) {
    console.error('Resend enrollment status email failed:', error);
    throw new Error('Failed to send enrollment status email');
  }
}