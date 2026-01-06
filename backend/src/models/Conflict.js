const mongoose = require('mongoose');

const conflictSchema = new mongoose.Schema({
    entityType: {
        type: String,
        enum: ['contact', 'company'],
        required: true,
        index: true,
    },
    entityId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true,
    },
    hubspotId: {
        type: String,
        index: true,
    },
    localVersion: {
        type: mongoose.Schema.Types.Mixed,
        required: true,
    },
    hubspotVersion: {
        type: mongoose.Schema.Types.Mixed,
        required: true,
    },
    conflictingFields: [{
        type: String,
    }],
    localTimestamp: {
        type: Date,
        required: true,
    },
    hubspotTimestamp: {
        type: Date,
        required: true,
    },
    detectedAt: {
        type: Date,
        default: Date.now,
        index: true,
    },
    resolvedAt: {
        type: Date,
        default: null,
    },
    resolutionType: {
        type: String,
        enum: ['pending', 'keep_local', 'keep_hubspot', 'merged', 'auto_resolved'],
        default: 'pending',
        index: true,
    },
    resolvedBy: {
        type: String,
        default: null,
    },
    mergedData: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
    },
    auditLog: [{
        action: {
            type: String,
            required: true,
        },
        timestamp: {
            type: Date,
            default: Date.now,
        },
        user: {
            type: String,
            default: 'system',
        },
        details: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    }],
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium',
        index: true,
    },
}, {
    timestamps: true,
});

// Compound indexes
conflictSchema.index({ resolutionType: 1, detectedAt: -1 });
conflictSchema.index({ entityType: 1, resolutionType: 1 });

// Method to add audit log entry
conflictSchema.methods.addAuditEntry = function (action, user, details = {}) {
    this.auditLog.push({
        action,
        timestamp: new Date(),
        user,
        details,
    });
    return this.save();
};

// Static method to get unresolved conflicts count by type
conflictSchema.statics.getUnresolvedCounts = async function () {
    return this.aggregate([
        { $match: { resolutionType: 'pending' } },
        { $group: { _id: '$entityType', count: { $sum: 1 } } },
    ]);
};

const Conflict = mongoose.model('Conflict', conflictSchema);

module.exports = Conflict;
