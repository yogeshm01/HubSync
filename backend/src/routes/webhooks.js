const express = require('express');
const crypto = require('crypto');
const { addSyncFromHubspotJob } = require('../queues/syncQueue');
const logger = require('../utils/logger');

const router = express.Router();

// Verify HubSpot webhook signature
const verifySignature = (req, res, next) => {
    const signature = req.headers['x-hubspot-signature-v3'];
    const timestamp = req.headers['x-hubspot-request-timestamp'];

    if (!signature || !timestamp) {
        // In development, allow unsigned requests
        if (process.env.NODE_ENV === 'development') {
            logger.warn('Webhook received without signature (development mode)');
            return next();
        }
        return res.status(401).json({ error: 'Missing signature' });
    }

    // Verify timestamp is within 5 minutes
    const now = Date.now();
    const requestTime = parseInt(timestamp);
    if (Math.abs(now - requestTime) > 5 * 60 * 1000) {
        return res.status(401).json({ error: 'Request timestamp expired' });
    }

    // Verify signature
    const secret = process.env.HUBSPOT_WEBHOOK_SECRET;
    const rawBody = JSON.stringify(req.body);
    const signatureBase = `${req.method}${req.protocol}://${req.get('host')}${req.originalUrl}${rawBody}${timestamp}`;

    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signatureBase)
        .digest('base64');

    if (signature !== expectedSignature) {
        logger.warn('Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
    }

    next();
};

// POST /api/webhooks/hubspot - Receive HubSpot webhook events
router.post('/hubspot', verifySignature, async (req, res) => {
    try {
        const events = Array.isArray(req.body) ? req.body : [req.body];

        logger.info(`Received ${events.length} webhook event(s) from HubSpot`);

        for (const event of events) {
            const { subscriptionType, objectId, propertyName, propertyValue } = event;

            // Parse event type
            // Format: contact.creation, contact.propertyChange, company.deletion, etc.
            const [objectType, eventType] = subscriptionType?.split('.') || [];

            if (!objectType || !eventType) {
                logger.warn('Unknown webhook event format:', event);
                continue;
            }

            // Map to our entity types
            const entityType = objectType === 'contact' ? 'contact' :
                objectType === 'company' ? 'company' : null;

            if (!entityType) {
                logger.warn(`Unsupported object type: ${objectType}`);
                continue;
            }

            // Determine event action
            let action;
            switch (eventType) {
                case 'creation':
                    action = 'create';
                    break;
                case 'deletion':
                    action = 'delete';
                    break;
                case 'propertyChange':
                case 'merge':
                    action = 'update';
                    break;
                default:
                    logger.warn(`Unknown event type: ${eventType}`);
                    continue;
            }

            // Queue sync job
            await addSyncFromHubspotJob(entityType, objectId.toString(), action);

            logger.debug(`Queued webhook event: ${entityType} ${objectId} ${action}`);
        }

        // HubSpot expects a quick 200 response
        res.status(200).json({ received: true });
    } catch (error) {
        logger.error('Error processing webhook:', error);
        // Still return 200 to prevent HubSpot from retrying
        res.status(200).json({ received: true, error: 'Processing error' });
    }
});

// GET /api/webhooks/hubspot - Handle HubSpot verification challenge
router.get('/hubspot', (req, res) => {
    // HubSpot sends a challenge for webhook URL verification
    const challenge = req.query.challenge;
    if (challenge) {
        res.send(challenge);
    } else {
        res.json({ status: 'Webhook endpoint active' });
    }
});

module.exports = router;
