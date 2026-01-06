const mongoose = require('mongoose');

const syncLogSchema = new mongoose.Schema({
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
    action: {
        type: String,
        enum: ['create', 'update', 'delete'],
        required: true,
        index: true,
    },
    direction: {
        type: String,
        enum: ['to_hubspot', 'from_hubspot'],
        required: true,
        index: true,
    },
    status: {
        type: String,
        enum: ['success', 'failed', 'pending', 'retrying'],
        default: 'pending',
        index: true,
    },
    errorMessage: {
        type: String,
        default: null,
    },
    errorStack: {
        type: String,
        default: null,
    },
    retryCount: {
        type: Number,
        default: 0,
    },
    maxRetries: {
        type: Number,
        default: 5,
    },
    nextRetryAt: {
        type: Date,
        default: null,
        index: true,
    },
    payload: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
    },
    response: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
    },
    completedAt: {
        type: Date,
        default: null,
    },
    duration: {
        type: Number, // Duration in milliseconds
        default: null,
    },
}, {
    timestamps: true,
});

// Compound indexes for common queries
syncLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
syncLogSchema.index({ status: 1, createdAt: -1 });
syncLogSchema.index({ status: 1, nextRetryAt: 1 });

// TTL index to auto-delete old success logs after 30 days
syncLogSchema.index(
    { completedAt: 1 },
    { expireAfterSeconds: 30 * 24 * 60 * 60, partialFilterExpression: { status: 'success' } }
);

const SyncLog = mongoose.model('SyncLog', syncLogSchema);

module.exports = SyncLog;
