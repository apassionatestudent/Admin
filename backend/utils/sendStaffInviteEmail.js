// utils/sendStaffInviteEmail.js

import { resend } from '../config/email.js';

// => Points at the admin frontend's public set-password route - the admin app is
// => already reachable at this origin even though it isn't linked from anywhere public
const ADMIN_APP_URL = process.env.ADMIN_APP_URL || 'http://localhost:3173';

// => Sends the invite link a new staff member uses to set their own password.
export async function sendStaffInviteEmail({ toEmail, fullName, rawToken }) {
    const inviteLink = `${ADMIN_APP_URL}/set-password/${rawToken}`;

    const { error } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: toEmail,
        subject: 'PrimeEnroll Digital - Set up your staff account',
        html: `
            <!DOCTYPE html>
            <html>
            <body style="margin:0; padding:0; background-color:#f4f5f8; font-family:Georgia, 'Times New Roman', serif;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f8; padding:40px 0;">
                    <tr>
                        <td align="center">
                            <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e5e4e7;">

                                <!-- => Maroon header bar, matches the admin sidebar's --sidebar-bg -->
                                <tr>
                                    <td style="background-color:#660911; padding:28px 36px;">
                                        <span style="color:#ffffff; font-size:20px; font-weight:700; letter-spacing:0.02em;">
                                            PrimeEnroll Digital
                                        </span>
                                        <div style="color:rgba(255,255,255,0.7); font-size:12px; margin-top:4px; text-transform:uppercase; letter-spacing:0.08em;">
                                            Admin Dashboard
                                        </div>
                                    </td>
                                </tr>

                                <!-- => Body -->
                                <tr>
                                    <td style="padding:36px;">
                                        <h1 style="margin:0 0 16px; font-size:20px; color:#08060d; font-weight:700;">
                                            Hi ${fullName},
                                        </h1>
                                        <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:#3a3540;">
                                            A staff account has been created for you on PrimeEnroll Digital.
                                            Click the button below to set your password and finish setting up your account.
                                        </p>

                                        <!-- => CTA button -->
                                        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                                            <tr>
                                                <td style="border-radius:8px; background-color:#8a0d17;">
                                                    <a href="${inviteLink}"
                                                       style="display:inline-block; padding:13px 28px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px;">
                                                        Set Your Password
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>

                                        <p style="margin:0 0 8px; font-size:13px; color:#6b6375;">
                                            Or copy and paste this link into your browser:
                                        </p>
                                        <p style="margin:0 0 24px; font-size:13px; word-break:break-all;">
                                            <a href="${inviteLink}" style="color:#8a0d17;">${inviteLink}</a>
                                        </p>

                                        <p style="margin:0; font-size:13px; color:#6b6375; border-top:1px solid #e5e4e7; padding-top:16px;">
                                            This link expires in 24 hours. If you weren't expecting this invitation,
                                            you can safely ignore this email.
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

    // => Resend doesn't throw on failure - it returns { data: null, error }.
    // => Without this check, a bad from-address or missing env var fails
    // => silently and nobody finds out until the invited staff member says they
    // => never got the email
    if (error) {
        console.error('Resend invite email failed:', error);
        throw new Error('Failed to send invite email');
    }
}