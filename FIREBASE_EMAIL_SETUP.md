# Firebase Trigger Email Extension Setup Guide

To actually send emails from Famoria (instead of just queuing them), you need to install the official **Trigger Email** extension in your Firebase project.

## 1. Install Extension
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Select your project **famoria-1**.
3. In the left sidebar, click **Extensions** (bottom of the "Build" section).
4. Search for "**Trigger Email**" (by Firebase).
5. Click **Install**.

## 2. Configure Extension
During installation, you will be asked to configure the following settings:

-   **Cloud Functions location**: **CRITICAL STEP**
    -   You MUST choose the region that matches your Firestore database location.
    -   If your database is in `nam5` (us-central), choose `us-central1`.
    -   If your database is in `asia-south1`, choose `asia-south1`.
    -   *See "Troubleshooting" below if you are unsure.*
-   **Email documents collection**: Set this exactly to: `mail`
    -   *Why?* Our code queues emails to the `mail` collection in Firestore.
-   **SMTP Connection URI**: You need an email service provider (SendGrid, Mailgun, Postmark, Gmail, etc.).
    -   **For Personal Gmail** (easiest for testing):
        -   URI format: `smtps://<your_email>@gmail.com:<app_password>@smtp.gmail.com:465`
        -   **Note**: You must generate an **App Password** from your Google Account settings (Security > 2-Step Verification > App passwords). Do NOT use your regular password.
    -   **For SendGrid/Mailgun** (recommended for production):
        -   Follow their docs to get an API key.
        -   URI format: `smtps://apikey:<your_api_key>@smtp.sendgrid.net:465`
-   **Default FROM email address**: e.g., `noreply@famoria.app` or your Gmail address.

## 3. Enable Firestore Rules
Ensure your `mail` collection is writable by authenticated users (for creating notifications) but secure. The extension runs with admin privileges, so it can read any created document.

*Currently, your app handles this by using the `db` instance which respects security rules. Ensure your `firestore.rules` allows creating documents in the `mail` collection.*

## 4. Verification
1.  After installation, wait a few minutes for the Cloud Function to deploy.
2.  In Famoria, try inviting a user or triggering a notification.
3.  Check the **Firestore Data** tab in Firebase Console.
4.  Look at the `mail` collection. You should see a document created.
5.  Wait a few seconds. The document should update with a `delivery` field:
    -   `state: "SUCCESS"` -> Email sent!
    -   `state: "ERROR"` -> Check the `error` field for details (usually SMTP config issues).

> [!IMPORTANT]
> If you are on the **Spark (Free) plan**, you can only send emails via Google services (like Gmail SMTP). To use SendGrid or others, you must upgrade to the **Blaze (Pay-as-you-go) plan**.

---

## Post installation steps :

See it in action
You can test out this extension right away!

Go to your Cloud Firestore dashboard in the Firebase console. Note that, if you have configured a non-default firestore database, you may have to view it via the Google Cloud Console.

If it doesn’t already exist, create the collection you specified during installation: mail.

Add a document with a to field and a message field with the following content:

to: ['someone@example.com'],
message: {
  subject: 'Hello from Firebase!',
  text: 'This is the plaintext section of the email body.',
  html: 'This is the <code>HTML</code> section of the email body.',
}
In a few seconds, you’ll see a delivery field appear in the document. The field will update as the extension processes the email.

Note: You can also use the Firebase Admin SDK to add a document:

admin
  .firestore()
  .collection("mail")
  .add({
    to: "someone@example.com",
    message: {
      subject: "Hello from Firebase!",
      text: "This is the plaintext section of the email body.",
      html: "This is the <code>HTML</code> section of the email body.",
    },
  })
  .then(() => console.log("Queued email for delivery!"));
Using this extension
See the official documentation for information on using this extension, including advanced use cases such as using Handlebars templates and managing email delivery status.

Firestore-Send-Email: SendGrid Categories
When using SendGrid (SMTP_CONNECTION_URI includes sendgrid.net), you can assign categories to your emails.

Example JSON with Categories:
{
  "to": ["example@example.com"],
  "categories": ["Example_Category"],
  "message": {
    "subject": "Test Email with Categories",
    "text": "This is a test email to see if categories work.",
    "html": "<strong>This is a test email to see if categories work.</strong>"
  }
}
Add this document to the Firestore mail collection to send categorized emails.

For more details, see the SendGrid Categories documentation.

Firestore-Send-Email: SendGrid Dynamic Templates
When using SendGrid, you can use SendGrid Dynamic Templates to create and send templated emails.

Example JSON representation of Firestore document for a Dynamic Template:
{
  "to": ["example@example.com"],
  "sendGrid": {
    "templateId": "d-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "dynamicTemplateData": {
      "name": "John Doe",
      "company": "Example Corp",
      "position": "Developer"
    }
  }
}
Add this document to the Firestore mail collection to send an email using a SendGrid Dynamic Template. The templateId is required and should be your SendGrid Dynamic Template ID (always starts with ‘d-‘). The dynamicTemplateData object contains the variables that will be used in your template.

For more details, see the SendGrid Dynamic Templates documentation.

Understanding SendGrid Email IDs
When an email is sent successfully, the extension tracks two different IDs in the delivery information:

Queue ID: This is SendGrid’s internal queue identifier (from the x-message-id header). It’s useful for tracking the email within SendGrid’s system.
Message ID: This is the RFC-2822 Message-ID header, which is a standard email identifier used across email systems.
You can find both IDs in the delivery.info field of your email document after successful delivery:

{
  "delivery": {
    "info": {
      "messageId": "<unique-message-id@your-domain.com>",
      "sendgridQueueId": "sendgrid-queue-id",
      "accepted": ["recipient@example.com"],
      "rejected": [],
      "pending": [],
      "response": "status=202"
    }
  }
}
Automatic Deletion of Email Documents
To use Firestore’s TTL feature for automatic deletion of expired email documents, the extension provides several configuration parameters.

The extension will set a TTL field in the email documents, but you will need to manually configure a TTL policy for the collection/collection group the extension targets, on the delivery.expireAt field.

Detailed instructions for creating a TTL field can be found in the Firestore TTL Policy documentation.

Monitoring
As a best practice, you can monitor the activity of your installed extension, including checks on its health, usage, and logs.

Further reading & resources
You can find more information about this extension in the following articles:

Sending Emails Using Firestore And Firebase Extensions
Create custom event handlers
This extension publishes events to the projects/famoria-app/locations/us-central1/channels/firebase channel. You can create custom handlers that respond to events on this channel. For example:

import { onCustomEventPublished } from "firebase-functions/v2/eventarc";

export const eventhandler = onCustomEventPublished(
    "firebase.extensions.firestore-send-email.v1.onComplete",
    (e) => {
        // Handle extension event here.
    });



