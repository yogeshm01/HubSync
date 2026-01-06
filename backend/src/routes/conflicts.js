const express = require('express');
const { param, body, query, validationResult } = require('express-validator');
const { conflictService } = require('../services/conflictService');
const { syncService } = require('../services/syncService');
const logger = require('../utils/logger');

const router = express.Router();

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

// GET /api/conflicts - List unresolved conflicts
router.get('/', [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('entityType').optional().isIn(['contact', 'company']),
    validate,
], async (req, res) => {
    try {
        const result = await conflictService.getUnresolvedConflicts({
            entityType: req.query.entityType,
            page: req.query.page || 1,
            limit: req.query.limit || 20,
        });

        res.json({
            data: result.conflicts,
            pagination: result.pagination,
        });
    } catch (error) {
        logger.error('Error fetching conflicts:', error);
        res.status(500).json({ error: 'Failed to fetch conflicts' });
    }
});

// GET /api/conflicts/counts - Get conflict counts
router.get('/counts', async (req, res) => {
    try {
        const counts = await conflictService.getConflictCounts();
        res.json({ data: counts });
    } catch (error) {
        logger.error('Error fetching conflict counts:', error);
        res.status(500).json({ error: 'Failed to fetch conflict counts' });
    }
});

// GET /api/conflicts/history - Get resolved conflicts
router.get('/history', [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('entityType').optional().isIn(['contact', 'company']),
    validate,
], async (req, res) => {
    try {
        const result = await conflictService.getConflictHistory({
            entityType: req.query.entityType,
            page: req.query.page || 1,
            limit: req.query.limit || 20,
        });

        res.json({
            data: result.conflicts,
            pagination: result.pagination,
        });
    } catch (error) {
        logger.error('Error fetching conflict history:', error);
        res.status(500).json({ error: 'Failed to fetch conflict history' });
    }
});

// GET /api/conflicts/:id - Get a single conflict
router.get('/:id', [
    param('id').isMongoId(),
    validate,
], async (req, res) => {
    try {
        const conflict = await conflictService.getConflictById(req.params.id);

        if (!conflict) {
            return res.status(404).json({ error: 'Conflict not found' });
        }

        res.json({ data: conflict });
    } catch (error) {
        logger.error('Error fetching conflict:', error);
        res.status(500).json({ error: 'Failed to fetch conflict' });
    }
});

// POST /api/conflicts/:id/resolve - Resolve a conflict
router.post('/:id/resolve', [
    param('id').isMongoId(),
    body('type').isIn(['keep_local', 'keep_hubspot', 'merged']),
    body('fieldChoices').optional().isObject(),
    body('resolvedBy').optional().isString().trim(),
    validate,
], async (req, res) => {
    try {
        const { type, fieldChoices, resolvedBy } = req.body;

        // Validate fieldChoices is provided for merged type
        if (type === 'merged' && (!fieldChoices || Object.keys(fieldChoices).length === 0)) {
            return res.status(400).json({
                error: 'fieldChoices is required for merged resolution type'
            });
        }

        const entity = await syncService.applyConflictResolution(
            req.params.id,
            { type, fieldChoices },
            resolvedBy || 'user'
        );

        res.json({
            message: 'Conflict resolved successfully',
            data: entity,
        });
    } catch (error) {
        logger.error('Error resolving conflict:', error);

        if (error.message === 'Conflict not found') {
            return res.status(404).json({ error: error.message });
        }
        if (error.message === 'Conflict already resolved') {
            return res.status(400).json({ error: error.message });
        }

        res.status(500).json({ error: 'Failed to resolve conflict' });
    }
});

module.exports = router;
