const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { Contact, Company } = require('../models');
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

// GET /api/contacts - List all contacts with pagination and filtering
router.get('/', [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().isString().trim(),
    query('syncStatus').optional().isIn(['synced', 'pending', 'conflict', 'error']),
    validate,
], async (req, res) => {
    try {
        const page = req.query.page || 1;
        const limit = req.query.limit || 20;
        const skip = (page - 1) * limit;

        // Build query
        const filter = { isDeleted: false };

        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            filter.$or = [
                { email: searchRegex },
                { firstName: searchRegex },
                { lastName: searchRegex },
            ];
        }

        if (req.query.syncStatus) {
            filter.syncStatus = req.query.syncStatus;
        }

        const [contacts, total] = await Promise.all([
            Contact.find(filter)
                .populate('company', 'name domain')
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Contact.countDocuments(filter),
        ]);

        res.json({
            data: contacts,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        logger.error('Error fetching contacts:', error);
        res.status(500).json({ error: 'Failed to fetch contacts' });
    }
});

// GET /api/contacts/:id - Get a single contact
router.get('/:id', [
    param('id').isMongoId(),
    validate,
], async (req, res) => {
    try {
        const contact = await Contact.findById(req.params.id)
            .populate('company', 'name domain');

        if (!contact || contact.isDeleted) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        res.json({ data: contact });
    } catch (error) {
        logger.error('Error fetching contact:', error);
        res.status(500).json({ error: 'Failed to fetch contact' });
    }
});

// POST /api/contacts - Create a new contact
router.post('/', [
    body('email').isEmail().normalizeEmail(),
    body('firstName').optional().isString().trim().isLength({ max: 100 }),
    body('lastName').optional().isString().trim().isLength({ max: 100 }),
    body('phone').optional().isString().trim().isLength({ max: 50 }),
    body('company').optional().isMongoId(),
    body('customFields').optional().isObject(),
    validate,
], async (req, res) => {
    try {
        // Check for existing email
        const existing = await Contact.findOne({ email: req.body.email, isDeleted: false });
        if (existing) {
            return res.status(409).json({ error: 'Contact with this email already exists' });
        }

        // Validate company exists
        if (req.body.company) {
            const company = await Company.findById(req.body.company);
            if (!company || company.isDeleted) {
                return res.status(400).json({ error: 'Company not found' });
            }
        }

        const contact = new Contact({
            email: req.body.email,
            firstName: req.body.firstName || '',
            lastName: req.body.lastName || '',
            phone: req.body.phone || '',
            company: req.body.company || null,
            customFields: req.body.customFields || {},
            syncStatus: 'pending',
        });

        await contact.save();

        // Queue sync to HubSpot
        await addSyncToHubspotJob('contact', contact._id, 'high');

        logger.info(`Created contact: ${contact._id}`);
        res.status(201).json({ data: contact });
    } catch (error) {
        logger.error('Error creating contact:', error);
        res.status(500).json({ error: 'Failed to create contact' });
    }
});

// PUT /api/contacts/:id - Update a contact
router.put('/:id', [
    param('id').isMongoId(),
    body('email').optional().isEmail().normalizeEmail(),
    body('firstName').optional().isString().trim().isLength({ max: 100 }),
    body('lastName').optional().isString().trim().isLength({ max: 100 }),
    body('phone').optional().isString().trim().isLength({ max: 50 }),
    body('company').optional().isMongoId(),
    body('customFields').optional().isObject(),
    validate,
], async (req, res) => {
    try {
        const contact = await Contact.findById(req.params.id);

        if (!contact || contact.isDeleted) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        // Check email uniqueness if changing
        if (req.body.email && req.body.email !== contact.email) {
            const existing = await Contact.findOne({
                email: req.body.email,
                isDeleted: false,
                _id: { $ne: contact._id }
            });
            if (existing) {
                return res.status(409).json({ error: 'Contact with this email already exists' });
            }
        }

        // Validate company exists
        if (req.body.company) {
            const company = await Company.findById(req.body.company);
            if (!company || company.isDeleted) {
                return res.status(400).json({ error: 'Company not found' });
            }
        }

        // Update fields
        const updateFields = ['email', 'firstName', 'lastName', 'phone', 'company', 'customFields'];
        updateFields.forEach(field => {
            if (req.body[field] !== undefined) {
                contact[field] = req.body[field];
            }
        });

        contact.syncStatus = 'pending';
        await contact.save();

        // Queue sync to HubSpot
        await addSyncToHubspotJob('contact', contact._id);

        logger.info(`Updated contact: ${contact._id}`);
        res.json({ data: contact });
    } catch (error) {
        logger.error('Error updating contact:', error);
        res.status(500).json({ error: 'Failed to update contact' });
    }
});

// DELETE /api/contacts/:id - Soft delete a contact
router.delete('/:id', [
    param('id').isMongoId(),
    validate,
], async (req, res) => {
    try {
        const contact = await Contact.findById(req.params.id);

        if (!contact || contact.isDeleted) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        contact.isDeleted = true;
        contact.syncStatus = 'pending';
        await contact.save();

        // Note: For full implementation, would queue a delete job to HubSpot
        logger.info(`Deleted contact: ${contact._id}`);
        res.json({ message: 'Contact deleted successfully' });
    } catch (error) {
        logger.error('Error deleting contact:', error);
        res.status(500).json({ error: 'Failed to delete contact' });
    }
});

module.exports = router;
