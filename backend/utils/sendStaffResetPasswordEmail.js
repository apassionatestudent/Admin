// utils/sendStaffResetPasswordEmail.js

import { resend } from '../config/email.js';

const ADMIN_APP_URL = process.env.ADMIN_APP_URL || 'http://localhost:3173';

// => Sent when a super_admin resets an already-active staff member's password.
// => Reuses the same /set-password/:token page as the invite flow - that
// => page's job is just "set a password for this token," it doesn't need
// => to know or care whether this is someone's first password or their fifth.
export async function sendStaffResetPasswordEmail({ toEmail, fullName, rawToken }) {
    const resetLink = `${ADMIN_APP_URL}/set-password/${rawToken}`;

    const { error } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: toEmail,
        subject: 'PrimeEnroll Digital - Reset Your Staff Password',
        html: `
            <!DOCTYPE html>
            <html>
            <body style="margin:0; padding:0; background-color:#f4f5f8; font-family:Georgia, 'Times New Roman', serif;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f8; padding:40px 0;">
                    <tr>
                        <td align="center">
                            <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e5e4e7;">

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

                                <tr>
                                    <td style="padding:36px;">
                                        <h1 style="margin:0 0 16px; font-size:20px; color:#08060d; font-weight:700;">
                                            Hi ${fullName},
                                        </h1>
                                        <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:#3a3540;">
                                            A super admin has reset the password for your PrimeEnroll staff account.
                                            Click the button below to set a new password.
                                        </p>

                                        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                                            <tr>
                                                <td style="border-radius:8px; background-color:#8a0d17;">
                                                    <a href="${resetLink}"
                                                       style="display:inline-block; padding:13px 28px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px;">
                                                        Reset Your Password
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>

                                        <p style="margin:0 0 8px; font-size:13px; color:#6b6375;">
                                            Or copy and paste this link into your browser:
                                        </p>
                                        <p style="margin:0 0 24px; font-size:13px; word-break:break-all;">
                                            <a href="${resetLink}" style="color:#8a0d17;">${resetLink}</a>
                                        </p>

                                        <p style="margin:0; font-size:13px; color:#6b6375; border-top:1px solid #e5e4e7; padding-top:16px;">
                                            This link expires in 24 hours. If you weren't expecting this, contact
                                            your system administrator, your current password remains unchanged until
                                            you complete this reset.
                                        </p>
                                    </td>
                                </tr>

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

    if (error) {
        console.error('Resend reset-password email failed:', error);
        throw new Error('Failed to send reset password email');
    }
}