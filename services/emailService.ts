import { db } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';

const MAIL_COLLECTION = 'mail';

type NotificationType = 'like' | 'comment' | 'tag' | 'mention' | 'accept_invite';

interface EmailData {
    actorName: string;
    message?: string;
    photoUrl?: string;
}

/**
 * Send notification email via Firestore mail queue
 * Emails are processed by backend Cloud Function or extension
 */
export const emailService = {
    sendNotificationEmailBackground: async (
        toEmail: string,
        toName: string,
        type: NotificationType,
        data: EmailData
    ) => {
        try {
            const subject = getEmailSubject(type);
            const htmlContent = getEmailTemplate(type, toName, data);

            await addDoc(collection(db, MAIL_COLLECTION), {
                to: [toEmail],
                message: {
                    subject,
                    text: getPlainTextVersion(type, data),
                    html: htmlContent
                },
                metadata: {
                    type,
                    recipientName: toName,
                    actorName: data.actorName
                },
                createdAt: Date.now()
            });

            console.log(`[EmailService] Queued ${type} email to ${toEmail}`);
        } catch (error) {
            console.error('[EmailService] Failed to queue email:', error);
            // Don't throw - email failure shouldn't break the main flow
        }
    },

    /**
     * Send an invitation email with a link containing the key
     */
    sendInvitationEmail: async (
        toEmail: string,
        inviterName: string,
        inviteUrl: string,
        albumName: string = 'Famoria'
    ) => {
        try {
            const subject = `${inviterName} invited you to join ${albumName}`;
            const htmlContent = getInvitationEmailTemplate(inviterName, inviteUrl, albumName);

            await addDoc(collection(db, MAIL_COLLECTION), {
                to: [toEmail],
                message: {
                    subject,
                    text: `${inviterName} has invited you to view an album on Famoria. Click here to join: ${inviteUrl}`,
                    html: htmlContent
                },
                metadata: {
                    type: 'invitation',
                    inviterName,
                    albumName
                },
                createdAt: Date.now()
            });
            console.log(`[EmailService] Queued invitation email to ${toEmail}`);
        } catch (error) {
            console.error('[EmailService] Failed to queue invitation email:', error);
            throw error;
        }
    }
};

function getEmailSubject(type: NotificationType): string {
    switch (type) {
        case 'like':
            return 'New like on Famoria';
        case 'comment':
            return 'New comment on Famoria';
        case 'tag':
            return 'You were tagged on Famoria';
        case 'mention':
            return 'You were mentioned on Famoria';
        case 'accept_invite':
            return 'Invitation accepted on Famoria';
        default:
            return 'New notification on Famoria';
    }
}

function getPlainTextVersion(type: NotificationType, data: EmailData): string {
    switch (type) {
        case 'like':
            return `${data.actorName} liked your memory on Famoria.`;
        case 'comment':
            return `${data.actorName} commented on your memory: ${data.message || ''}`;
        case 'tag':
            return `${data.actorName} tagged you in a memory on Famoria.`;
        case 'mention':
            return `${data.actorName} mentioned you in a comment on Famoria.`;
        case 'accept_invite':
            return `${data.actorName} accepted your invitation to join Famoria.`;
        default:
            return `You have a new notification from ${data.actorName} on Famoria.`;
    }
}

function getEmailTemplate(type: NotificationType, toName: string, data: EmailData): string {
    const actionText = getActionText(type);
    const message = data.message || '';
    const photoUrl = data.photoUrl || 'https://famoria.app';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f5f5f4;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f4; padding: 40px 0;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #f97316 0%, #fb923c 100%); padding: 40px 30px; text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">Famoria</h1>
                            <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 14px; opacity: 0.9;">Your Family Memories</p>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <p style="margin: 0 0 10px 0; color: #57534e; font-size: 16px;">Hi ${toName},</p>
                            <p style="margin: 0 0 20px 0; color: #1c1917; font-size: 18px; font-weight: 600;">
                                <strong style="color: #f97316;">${data.actorName}</strong> ${actionText}
                            </p>
                            ${message ? `<p style="margin: 0 0 30px 0; color: #57534e; font-size: 15px; padding: 15px; background-color: #fef3c7; border-left: 3px solid #f59e0b; border-radius: 4px;">"${message}"</p>` : ''}
                            
                            <table cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                                <tr>
                                    <td style="border-radius: 8px; background: linear-gradient(135deg, #f97316 0%, #fb923c 100%);">
                                        <a href="${photoUrl}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">
                                            View on Famoria
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #fafaf9; padding: 30px; text-align: center; border-top: 1px solid #e7e5e4;">
                            <p style="margin: 0 0 10px 0; color: #78716c; font-size: 14px;">Stay connected with your family memories</p>
                            <p style="margin: 0; color: #a8a29e; font-size: 12px;">© 2026 Famoria. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `.trim();
}

function getActionText(type: NotificationType): string {
    switch (type) {
        case 'like':
            return 'liked your memory.';
        case 'comment':
            return 'commented on your memory:';
        case 'tag':
            return 'tagged you in a new memory.';
        case 'mention':
            return 'mentioned you in a comment.';
        case 'accept_invite':
            return 'accepted your invitation.';
        default:
            return 'interacted with your content.';
    }
}

function getInvitationEmailTemplate(inviterName: string, inviteUrl: string, albumName: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f5f5f4;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f4; padding: 40px 0;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #f97316 0%, #fb923c 100%); padding: 40px 30px; text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">Famoria</h1>
                            <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 14px; opacity: 0.9;">Secure Family Sharing</p>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px; text-align: center;">
                            <h2 style="color: #1c1917; margin-bottom: 20px;">You've been invited!</h2>
                            <p style="margin: 0 0 20px 0; color: #57534e; font-size: 16px; line-height: 1.5;">
                                <strong>${inviterName}</strong> has invited you to view <strong>${albumName}</strong> on Famoria.
                            </p>
                            <p style="margin: 0 0 30px 0; color: #78716c; font-size: 14px;">
                                This invitation includes a secure key to access encrypted photos. Please keep this link safe.
                            </p>
                            
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center">
                                        <a href="${inviteUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #f97316 0%, #fb923c 100%); color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 8px;">
                                            Accept Invitation
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #fafaf9; padding: 30px; text-align: center; border-top: 1px solid #e7e5e4;">
                            <p style="margin: 0 0 10px 0; color: #78716c; font-size: 14px;">Famoria - Encrypted Family Memories</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `.trim();
}
