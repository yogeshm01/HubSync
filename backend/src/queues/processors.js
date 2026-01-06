const { syncService } = require('../services/syncService');
const { hubSpotService } = require('../services/hubspotService');
const { Contact, Company } = require('../models');
const logger = require('../utils/logger');

// Initialize queue processors
const initializeProcessors = (queues, io) => {
    const { syncToHubspotQueue, syncFromHubspotQueue, pollingSyncQueue } = queues;

    // Process sync-to-hubspot jobs
    syncToHubspotQueue.process(5, async (job) => {
        const { entityType, entityId } = job.data;
        logger.info(`Processing sync-to-hubspot job: ${entityType} ${entityId}`);

        job.progress(10);

        try {
            let result;
            if (entityType === 'contact') {
                result = await syncService.syncContactToHubSpot(entityId);
            } else if (entityType === 'company') {
                result = await syncService.syncCompanyToHubSpot(entityId);
            } else {
                throw new Error(`Unknown entity type: ${entityType}`);
            }

            job.progress(100);

            // Emit real-time update
            if (io) {
                io.emit('sync:completed', {
                    entityType,
                    entityId,
                    direction: 'to_hubspot',
                    success: result.success,
                    conflict: result.conflict || false,
                });
            }

            return result;
        } catch (error) {
            // Emit error notification
            if (io) {
                io.emit('sync:error', {
                    entityType,
                    entityId,
                    direction: 'to_hubspot',
                    error: error.message,
                });
            }
            throw error;
        }
    });

    // Process sync-from-hubspot jobs (webhook events)
    syncFromHubspotQueue.process(5, async (job) => {
        const { entityType, hubspotId, eventType } = job.data;
        logger.info(`Processing sync-from-hubspot job: ${entityType} ${hubspotId} (${eventType})`);

        job.progress(10);

        try {
            let result;

            if (eventType === 'delete') {
                // Handle deletion
                const Model = entityType === 'contact' ? Contact : Company;
                const entity = await Model.findOne({ hubspotId });
                if (entity) {
                    entity.isDeleted = true;
                    entity.syncStatus = 'synced';
                    await entity.save();
                }
                result = { success: true, deleted: true };
            } else {
                // Handle create/update
                if (entityType === 'contact') {
                    result = await syncService.syncContactFromHubSpot(hubspotId);
                } else if (entityType === 'company') {
                    result = await syncService.syncCompanyFromHubSpot(hubspotId);
                } else {
                    throw new Error(`Unknown entity type: ${entityType}`);
                }
            }

            job.progress(100);

            // Emit real-time update
            if (io) {
                io.emit('sync:completed', {
                    entityType,
                    hubspotId,
                    direction: 'from_hubspot',
                    success: result.success,
                    conflict: result.conflict || false,
                });
            }

            return result;
        } catch (error) {
            if (io) {
                io.emit('sync:error', {
                    entityType,
                    hubspotId,
                    direction: 'from_hubspot',
                    error: error.message,
                });
            }
            throw error;
        }
    });

    // Process polling sync jobs (batch sync)
    pollingSyncQueue.process(1, async (job) => {
        const { entityType } = job.data;
        logger.info(`Processing polling-sync job: ${entityType}`);

        const results = {
            contacts: { synced: 0, conflicts: 0, errors: 0 },
            companies: { synced: 0, conflicts: 0, errors: 0 },
        };

        try {
            // Sync contacts
            if (entityType === 'all' || entityType === 'contact') {
                job.progress(10);
                let after;
                do {
                    const { results: contacts, paging } = await hubSpotService.getAllContacts(100, after);

                    for (const hubspotContact of contacts) {
                        try {
                            const result = await syncService.syncContactFromHubSpot(hubspotContact.hubspotId);
                            if (result.success) {
                                results.contacts.synced++;
                            } else if (result.conflict) {
                                results.contacts.conflicts++;
                            }
                        } catch (error) {
                            results.contacts.errors++;
                            logger.error(`Error syncing contact ${hubspotContact.hubspotId}:`, error);
                        }
                    }

                    after = paging?.next?.after;
                } while (after);
            }

            job.progress(50);

            // Sync companies
            if (entityType === 'all' || entityType === 'company') {
                let after;
                do {
                    const { results: companies, paging } = await hubSpotService.getAllCompanies(100, after);

                    for (const hubspotCompany of companies) {
                        try {
                            const result = await syncService.syncCompanyFromHubSpot(hubspotCompany.hubspotId);
                            if (result.success) {
                                results.companies.synced++;
                            } else if (result.conflict) {
                                results.companies.conflicts++;
                            }
                        } catch (error) {
                            results.companies.errors++;
                            logger.error(`Error syncing company ${hubspotCompany.hubspotId}:`, error);
                        }
                    }

                    after = paging?.next?.after;
                } while (after);
            }

            job.progress(100);

            logger.info(`Polling sync completed:`, results);

            // Emit completion
            if (io) {
                io.emit('sync:polling_completed', results);
            }

            return results;
        } catch (error) {
            if (io) {
                io.emit('sync:polling_error', { error: error.message });
            }
            throw error;
        }
    });

    logger.info('Queue processors initialized');
};

module.exports = { initializeProcessors };
