const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
    hubspotId: {
        type: String,
        index: true,
        sparse: true,
    },
    name: {
        type: String,
        required: [true, 'Company name is required'],
        trim: true,
        index: true,
    },
    domain: {
        type: String,
        trim: true,
        lowercase: true,
        default: '',
        index: true,
    },
    industry: {
        type: String,
        trim: true,
        default: '',
    },
    customFields: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {},
    },
    syncStatus: {
        type: String,
        enum: ['synced', 'pending', 'conflict', 'error'],
        default: 'pending',
        index: true,
    },
    lastModifiedLocal: {
        type: Date,
        default: Date.now,
        index: true,
    },
    lastModifiedHubspot: {
        type: Date,
        default: null,
    },
    lastSyncedAt: {
        type: Date,
        default: null,
    },
    syncDirection: {
        type: String,
        enum: ['to_hubspot', 'from_hubspot', 'bidirectional', null],
        default: null,
    },
    version: {
        type: Number,
        default: 1,
    },
    isDeleted: {
        type: Boolean,
        default: false,
        index: true,
    },
}, {
    timestamps: true,
});

// Pre-save hook to update lastModifiedLocal
companySchema.pre('save', function (next) {
    if (this.isModified() && !this.isModified('lastSyncedAt') && !this.isModified('syncStatus')) {
        this.lastModifiedLocal = new Date();
        this.version += 1;
    }
    next();
});

// Index for efficient conflict detection
companySchema.index({ lastModifiedLocal: 1, lastModifiedHubspot: 1 });

const Company = mongoose.model('Company', companySchema);

module.exports = Company;
