const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { Company } = require('../models');
const { addSyncToHubspotJob } = require('../queues/syncQueue');
const logger = require('../utils/logger');

const router = express.Router();

// Validation middleware
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

// GET /api/companies - List all companies with pagination and filtering
router.get('/', [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().isString().trim(),
    query('syncStatus').optional().isIn(['synced', 'pending', 'conflict', 'error']),
    query('industry').optional().isString().trim(),
    validate,
], async (req, res) => {
    try {
        const page = req.query.page || 1;
        const limit = req.query.limit || 20;
        const skip = (page - 1) * limit;

        const filter = { isDeleted: false };

        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            filter.$or = [
                { name: searchRegex },
                { domain: searchRegex },
            ];
        }

        if (req.query.syncStatus) {
            filter.syncStatus = req.query.syncStatus;
        }

        if (req.query.industry) {
            filter.industry = req.query.industry;
        }

        const [companies, total] = await Promise.all([
            Company.find(filter)
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Company.countDocuments(filter),
        ]);

        res.json({
            data: companies,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        logger.error('Error fetching companies:', error);
        res.status(500).json({ error: 'Failed to fetch companies' });
    }
});

// GET /api/companies/:id - Get a single company
router.get('/:id', [
    param('id').isMongoId(),
    validate,
], async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);

        if (!company || company.isDeleted) {
            return res.status(404).json({ error: 'Company not found' });
        }

        res.json({ data: company });
    } catch (error) {
        logger.error('Error fetching company:', error);
        res.status(500).json({ error: 'Failed to fetch company' });
    }
});

// POST /api/companies - Create a new company
router.post('/', [
    body('name').notEmpty().isString().trim().isLength({ max: 200 }),
    body('domain').optional().isString().trim().isLength({ max: 100 }),
    body('industry').optional().isString().trim().isLength({ max: 100 }),
    body('customFields').optional().isObject(),
    validate,
], async (req, res) => {
    try {
        // Check for existing domain (if provided)
        if (req.body.domain) {
            const existing = await Company.findOne({
                domain: req.body.domain.toLowerCase(),
                isDeleted: false
            });
            if (existing) {
                return res.status(409).json({ error: 'Company with this domain already exists' });
            }
        }

        const company = new Company({
            name: req.body.name,
            domain: req.body.domain?.toLowerCase() || '',
            industry: req.body.industry || '',
            customFields: req.body.customFields || {},
            syncStatus: 'pending',
        });

        await company.save();

        // Queue sync to HubSpot
        await addSyncToHubspotJob('company', company._id, 'high');

        logger.info(`Created company: ${company._id}`);
        res.status(201).json({ data: company });
    } catch (error) {
        logger.error('Error creating company:', error);
        res.status(500).json({ error: 'Failed to create company' });
    }
});

// PUT /api/companies/:id - Update a company
router.put('/:id', [
    param('id').isMongoId(),
    body('name').optional().isString().trim().isLength({ max: 200 }),
    body('domain').optional().isString().trim().isLength({ max: 100 }),
    body('industry').optional().isString().trim().isLength({ max: 100 }),
    body('customFields').optional().isObject(),
    validate,
], async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);

        if (!company || company.isDeleted) {
            return res.status(404).json({ error: 'Company not found' });
        }

        // Check domain uniqueness if changing
        if (req.body.domain && req.body.domain.toLowerCase() !== company.domain) {
            const existing = await Company.findOne({
                domain: req.body.domain.toLowerCase(),
                isDeleted: false,
                _id: { $ne: company._id }
            });
            if (existing) {
                return res.status(409).json({ error: 'Company with this domain already exists' });
            }
        }

        // Update fields
        if (req.body.name !== undefined) company.name = req.body.name;
        if (req.body.domain !== undefined) company.domain = req.body.domain.toLowerCase();
        if (req.body.industry !== undefined) company.industry = req.body.industry;
        if (req.body.customFields !== undefined) company.customFields = req.body.customFields;

        company.syncStatus = 'pending';
        await company.save();

        // Queue sync to HubSpot
        await addSyncToHubspotJob('company', company._id);

        logger.info(`Updated company: ${company._id}`);
        res.json({ data: company });
    } catch (error) {
        logger.error('Error updating company:', error);
        res.status(500).json({ error: 'Failed to update company' });
    }
});

// DELETE /api/companies/:id - Soft delete a company
router.delete('/:id', [
    param('id').isMongoId(),
    validate,
], async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);

        if (!company || company.isDeleted) {
            return res.status(404).json({ error: 'Company not found' });
        }

        company.isDeleted = true;
        company.syncStatus = 'pending';
        await company.save();

        logger.info(`Deleted company: ${company._id}`);
        res.json({ message: 'Company deleted successfully' });
    } catch (error) {
        logger.error('Error deleting company:', error);
        res.status(500).json({ error: 'Failed to delete company' });
    }
});

module.exports = router;
