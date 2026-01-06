const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
    hubspotId: {
        type: String,
        index: true,
        sparse: true,
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        index: true,
    },
    firstName: {
        type: String,
        trim: true,
        default: '',
    },
    lastName: {
        type: String,
        trim: true,
        default: '',
    },
    phone: {
        type: String,
        trim: true,
        default: '',
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        index: true,
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
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

// Virtual for full name
contactSchema.virtual('fullName').get(function () {
    return `${this.firstName} ${this.lastName}`.trim();
});

// Pre-save hook to update lastModifiedLocal
contactSchema.pre('save', function (next) {
    if (this.isModified() && !this.isModified('lastSyncedAt') && !this.isModified('syncStatus')) {
        this.lastModifiedLocal = new Date();
        this.version += 1;
    }
    next();
});

// Index for efficient conflict detection
contactSchema.index({ lastModifiedLocal: 1, lastModifiedHubspot: 1 });

const Contact = mongoose.model('Contact', contactSchema);

module.exports = Contact;
