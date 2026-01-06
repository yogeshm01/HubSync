const express = require('express');
const { query, param, body, validationResult } = require('express-validator');
const { SyncLog, Contact, Company } = require('../models');
const { syncService } = require('../services/syncService');
const { hubSpotService } = require('../services/hubspotService');
const {
    getQueueStats,
    addPollingSyncJob,
    addSyncToHubspotJob
} = require('../queues/syncQueue');
const logger = require('../utils/logger');

const router = express.Router();

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

// GET /api/sync/status - Get overall sync status and statistics
router.get('/status', async (req, res) => {
    try {
        const [syncStats, queueStats, rateLimitStatus] = await Promise.all([
            syncService.getSyncStats(),
            getQueueStats(),
            Promise.resolve(hubSpotService.getRateLimitStatus()),
        ]);

        res.json({
            data: {
                entities: syncStats,
                queues: queueStats,
                rateLimit: rateLimitStatus,
            },
        });
    } catch (error) {
        logger.error('Error fetching sync status:', error);
        res.status(500).json({ error: 'Failed to fetch sync status' });
    }
});

// POST /api/sync/trigger - Trigger a full sync from HubSpot
router.post('/trigger', [
    body('entityType').optional().isIn(['all', 'contact', 'company']),
    validate,
], async (req, res) => {
    try {
        const entityType = req.body.entityType || 'all';

        const job = await addPollingSyncJob(entityType);

        logger.info(`Triggered polling sync for: ${entityType}`);
        res.json({
            message: 'Sync triggered successfully',
            jobId: job.id,
        });
    } catch (error) {
        logger.error('Error triggering sync:', error);
        res.status(500).json({ error: 'Failed to trigger sync' });
    }
});

// POST /api/sync/entity/:type/:id - Manually sync a specific entity
router.post('/entity/:type/:id', [
    param('type').isIn(['contact', 'company']),
    param('id').isMongoId(),
    validate,
], async (req, res) => {
    try {
        const { type, id } = req.params;

        const job = await addSyncToHubspotJob(type, id, 'high');

        res.json({
            message: `Sync queued for ${type} ${id}`,
            jobId: job.id,
        });
    } catch (error) {
        logger.error('Error queueing entity sync:', error);
        res.status(500).json({ error: 'Failed to queue sync' });
    }
});

// GET /api/sync/logs - Get sync logs with filtering
router.get('/logs', [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('entityType').optional().isIn(['contact', 'company']),
    query('status').optional().isIn(['success', 'failed', 'pending', 'retrying']),
    query('direction').optional().isIn(['to_hubspot', 'from_hubspot']),
    validate,
], async (req, res) => {
    try {
        const page = req.query.page || 1;
        const limit = req.query.limit || 20;
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.entityType) filter.entityType = req.query.entityType;
        if (req.query.status) filter.status = req.query.status;
        if (req.query.direction) filter.direction = req.query.direction;

        const [logs, total] = await Promise.all([
            SyncLog.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            SyncLog.countDocuments(filter),
        ]);

        res.json({
            data: logs,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        logger.error('Error fetching sync logs:', error);
        res.status(500).json({ error: 'Failed to fetch sync logs' });
    }
});

// POST /api/sync/retry/:logId - Retry a failed sync
router.post('/retry/:logId', [
    param('logId').isMongoId(),
    validate,
], async (req, res) => {
    try {
        const log = await SyncLog.findById(req.params.logId);

        if (!log) {
            return res.status(404).json({ error: 'Sync log not found' });
        }

        if (log.status !== 'failed') {
            return res.status(400).json({ error: 'Only failed syncs can be retried' });
        }

        // Queue retry
        const job = await addSyncToHubspotJob(log.entityType, log.entityId, 'high');

        // Update log
        log.status = 'retrying';
        log.retryCount += 1;
        await log.save();

        res.json({
            message: 'Retry queued',
            jobId: job.id,
        });
    } catch (error) {
        logger.error('Error retrying sync:', error);
        res.status(500).json({ error: 'Failed to retry sync' });
    }
});

// GET /api/sync/pending - Get entities pending sync
router.get('/pending', [
    query('type').optional().isIn(['contact', 'company']),
    validate,
], async (req, res) => {
    try {
        const result = {};

        if (!req.query.type || req.query.type === 'contact') {
            result.contacts = await Contact.find({
                syncStatus: { $in: ['pending', 'error'] },
                isDeleted: false
            })
                .select('_id email syncStatus lastModifiedLocal')
                .limit(100)
                .lean();
        }

        if (!req.query.type || req.query.type === 'company') {
            result.companies = await Company.find({
                syncStatus: { $in: ['pending', 'error'] },
                isDeleted: false
            })
                .select('_id name syncStatus lastModifiedLocal')
                .limit(100)
                .lean();
        }

        res.json({ data: result });
    } catch (error) {
        logger.error('Error fetching pending syncs:', error);
        res.status(500).json({ error: 'Failed to fetch pending syncs' });
    }
});

module.exports = router;
