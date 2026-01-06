const { Conflict, SyncLog } = require('../models');
const logger = require('../utils/logger');

class ConflictService {
    // Detect if there's a conflict between local and remote data
    detectConflict(localEntity, remoteEntity) {
        // If either doesn't exist, no conflict
        if (!localEntity || !remoteEntity) {
            return { hasConflict: false };
        }

        const localTime = new Date(localEntity.lastModifiedLocal).getTime();
        const remoteTime = new Date(remoteEntity.lastModifiedHubspot || remoteEntity.lastModifiedLocal).getTime();
        const lastSyncTime = localEntity.lastSyncedAt
            ? new Date(localEntity.lastSyncedAt).getTime()
            : 0;

        // Conflict exists if both were modified after the last sync
        const localModifiedAfterSync = localTime > lastSyncTime;
        const remoteModifiedAfterSync = remoteTime > lastSyncTime;

        if (localModifiedAfterSync && remoteModifiedAfterSync) {
            const conflictingFields = this.findConflictingFields(localEntity, remoteEntity);

            if (conflictingFields.length > 0) {
                return {
                    hasConflict: true,
                    conflictingFields,
                    localTimestamp: new Date(localTime),
                    remoteTimestamp: new Date(remoteTime),
                };
            }
        }

        return { hasConflict: false };
    }

    // Find which fields have conflicting values
    findConflictingFields(local, remote) {
        const compareFields = ['firstName', 'lastName', 'email', 'phone', 'name', 'domain', 'industry'];
        const conflicting = [];

        for (const field of compareFields) {
            const localValue = local[field];
            const remoteValue = remote[field];

            // Both have values and they're different
            if (localValue !== undefined && remoteValue !== undefined && localValue !== remoteValue) {
                conflicting.push(field);
            }
        }

        return conflicting;
    }

    // Create a new conflict record
    async createConflict(entityType, localEntity, hubspotEntity, conflictInfo) {
        const conflict = new Conflict({
            entityType,
            entityId: localEntity._id,
            hubspotId: localEntity.hubspotId || hubspotEntity.hubspotId,
            localVersion: this.sanitizeForStorage(localEntity),
            hubspotVersion: this.sanitizeForStorage(hubspotEntity),
            conflictingFields: conflictInfo.conflictingFields,
            localTimestamp: conflictInfo.localTimestamp,
            hubspotTimestamp: conflictInfo.remoteTimestamp,
            resolutionType: 'pending',
            priority: conflictInfo.conflictingFields.length > 2 ? 'high' : 'medium',
            auditLog: [{
                action: 'conflict_detected',
                user: 'system',
                details: { conflictingFields: conflictInfo.conflictingFields },
            }],
        });

        await conflict.save();
        logger.info(`Created conflict record for ${entityType} ${localEntity._id}`);

        return conflict;
    }

    // Sanitize entity for storage (remove Mongoose internals)
    sanitizeForStorage(entity) {
        const obj = entity.toObject ? entity.toObject() : { ...entity };
        delete obj.__v;
        delete obj.createdAt;
        delete obj.updatedAt;
        return obj;
    }

    // Resolve a conflict with a specific resolution type
    async resolveConflict(conflictId, resolution, resolvedBy = 'user') {
        const conflict = await Conflict.findById(conflictId);

        if (!conflict) {
            throw new Error('Conflict not found');
        }

        if (conflict.resolutionType !== 'pending') {
            throw new Error('Conflict already resolved');
        }

        let mergedData = null;

        switch (resolution.type) {
            case 'keep_local':
                mergedData = conflict.localVersion;
                break;

            case 'keep_hubspot':
                mergedData = conflict.hubspotVersion;
                break;

            case 'merged':
                mergedData = this.mergeFields(
                    conflict.localVersion,
                    conflict.hubspotVersion,
                    resolution.fieldChoices
                );
                break;

            default:
                throw new Error('Invalid resolution type');
        }

        conflict.resolutionType = resolution.type;
        conflict.resolvedAt = new Date();
        conflict.resolvedBy = resolvedBy;
        conflict.mergedData = mergedData;
        conflict.auditLog.push({
            action: 'conflict_resolved',
            user: resolvedBy,
            details: { resolutionType: resolution.type, mergedData },
        });

        await conflict.save();
        logger.info(`Resolved conflict ${conflictId} with type: ${resolution.type}`);

        return { conflict, mergedData };
    }

    // Merge fields based on user choices
    mergeFields(local, hubspot, fieldChoices) {
        const merged = { ...local };

        for (const [field, choice] of Object.entries(fieldChoices)) {
            if (choice === 'hubspot') {
                merged[field] = hubspot[field];
            }
            // else keep local value (already there)
        }
        return merged;
    }

    // Get all unresolved conflicts
    async getUnresolvedConflicts(options = {}) {
        const { entityType, page = 1, limit = 20 } = options;

        const query = { resolutionType: 'pending' };
        if (entityType) {
            query.entityType = entityType;
        }

        const conflicts = await Conflict.find(query)
            .sort({ priority: -1, detectedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await Conflict.countDocuments(query);

        return {
            conflicts,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    }

    // Get conflict by ID
    async getConflictById(conflictId) {
        return Conflict.findById(conflictId);
    }

    // Get conflict history (resolved conflicts)
    async getConflictHistory(options = {}) {
        const { entityType, page = 1, limit = 20 } = options;

        const query = { resolutionType: { $ne: 'pending' } };
        if (entityType) {
            query.entityType = entityType;
        }

        const conflicts = await Conflict.find(query)
            .sort({ resolvedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await Conflict.countDocuments(query);

        return {
            conflicts,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    }

    // Get conflict counts by status
    async getConflictCounts() {
        const pending = await Conflict.countDocuments({ resolutionType: 'pending' });
        const resolved = await Conflict.countDocuments({ resolutionType: { $ne: 'pending' } });
        const byType = await Conflict.getUnresolvedCounts();

        return {
            pending,
            resolved,
            byEntityType: byType.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {}),
        };
    }
}

const conflictService = new ConflictService();

module.exports = { ConflictService, conflictService };