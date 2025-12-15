/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { setGlobalOptions } from "firebase-functions";

import * as logger from "firebase-functions/logger";

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });


// Initialize Firebase Admin
import * as admin from "firebase-admin";
admin.initializeApp();

import { onCustomEventPublished } from "firebase-functions/v2/eventarc";

// Custom handler for "Trigger Email" extension events
export const onEmailDeliveryStatus = onCustomEventPublished(
    "firebase.extensions.firestore-send-email.v1.onComplete",
    (event) => {
        // Debug: Log the full structure for future reference
        logger.info("Full Event Payload", { event: JSON.stringify(event) });

        const data = event.data as any;

        // Handle the complex nested structure seen in the logs
        // The logs show the data is wrapped in a "doc" with "_fieldsProto"
        // precise path: data.doc._fieldsProto.delivery.mapValue.fields.state.stringValue

        let state = 'UNKNOWN';
        let error = undefined;
        let recipient = 'unknown';

        try {
            // Attempt to look for the fields in the proto structure
            const fields = data?.doc?._fieldsProto;

            if (fields) {
                // Extract State
                // delivery -> mapValue -> fields -> state -> stringValue
                state = fields.delivery?.mapValue?.fields?.state?.stringValue || 'UNKNOWN';

                // Extract Error
                // delivery -> mapValue -> fields -> error -> stringValue
                error = fields.delivery?.mapValue?.fields?.error?.stringValue;

                // Extract Recipient
                // to -> arrayValue -> values[0] -> stringValue
                const toValues = fields.to?.arrayValue?.values;
                if (toValues && Array.isArray(toValues) && toValues.length > 0) {
                    recipient = toValues.map((v: any) => v.stringValue).join(', ');
                }
            } else {
                // Fallback for simpler object structure if the extension changes format
                // or if using a different event type in future
                if (data?.delivery?.state) state = data.delivery.state;
                if (data?.delivery?.error) error = data.delivery.error;
                if (data?.to) recipient = Array.isArray(data.to) ? data.to.join(', ') : data.to;
            }

        } catch (err) {
            logger.error("Failed to parse event data", { error: err });
        }

        if (state === 'UNKNOWN') {
            logger.warn("Could not find delivery state in event data", { data });
        } else if (state === 'ERROR') {
            logger.error(`Email delivery FAILED to ${recipient}`, { error, state });
        } else {
            logger.info(`Email delivery ${state} to ${recipient}`, { state });
        }

        return;
    });

