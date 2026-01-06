const { Contact, Company, SyncLog } = require('../models');
const { hubSpotService } = require('./hubspotService');
const { conflictService } = require('./conflictService');
const logger = require('../utils/logger');

class SyncService {
    // Sync a local contact to HubSpot
    async syncContactToHubSpot(contactId) {
        const startTime = Date.now();
        logger.info(`[SyncTrace] Starting syncContactToHubSpot for ${contactId}`);
        const contact = await Contact.findById(contactId);

        if (!contact) {
            logger.error(`[SyncTrace] Contact not found: ${contactId}`);
            throw new Error('Contact not found');
        }

        const syncLog = new SyncLog({
            entityType: 'contact',
            entityId: contact._id,
            hubspotId: contact.hubspotId,
            action: contact.hubspotId ? 'update' : 'create',
            direction: 'to_hubspot',
            status: 'pending',
            payload: contact.toObject(),
        });

        try {
            let result;

            logger.info(`[SyncTrace] Checked contact existence. HubspotId: ${contact.hubspotId}. (${Date.now() - startTime}ms)`);

            if (contact.hubspotId) {
                // Check for conflicts before updating
                const hubspotContact = await hubSpotService.getContact(contact.hubspotId);
                const conflictInfo = conflictService.detectConflict(contact, hubspotContact);

                logger.info(`[SyncTrace] Conflict check done. HasConflict: ${conflictInfo.hasConflict} (${Date.now() - startTime}ms)`);

                if (conflictInfo.hasConflict) {
                    await conflictService.createConflict('contact', contact, hubspotContact, conflictInfo);
                    contact.syncStatus = 'conflict';
                    await contact.save();

                    syncLog.status = 'failed';
                    syncLog.errorMessage = 'Conflict detected';
                    syncLog.completedAt = new Date();
                    syncLog.duration = Date.now() - startTime;
                    await syncLog.save();

                    return { success: false, conflict: true };
                }

                logger.info(`[SyncTrace] Calling updateContact... (${Date.now() - startTime}ms)`);
                result = await hubSpotService.updateContact(contact.hubspotId, contact);
            } else {
                logger.info(`[SyncTrace] Calling createContact... (${Date.now() - startTime}ms)`);
                result = await hubSpotService.createContact(contact);
            }

            logger.info(`[SyncTrace] HubSpot call completed (${Date.now() - startTime}ms)`);

            contact.hubspotId = result.hubspotId || result.id; // Handle different return structures if needed
            contact.syncStatus = 'synced';
            contact.lastSyncedAt = new Date();
            contact.lastModifiedHubspot = result.lastModifiedHubspot || new Date(result.updatedAt || Date.now());
            contact.syncDirection = 'to_hubspot';
            await contact.save();

            syncLog.hubspotId = contact.hubspotId;
            syncLog.status = 'success';
            syncLog.response = result;
            syncLog.completedAt = new Date();
            syncLog.duration = Date.now() - startTime;
            await syncLog.save();

            logger.info(`Synced contact ${contact._id} to HubSpot`);
            return { success: true, contact };
        } catch (error) {
            syncLog.status = 'failed';
            syncLog.errorMessage = error.message;
            syncLog.errorStack = error.stack;
            syncLog.completedAt = new Date();
            syncLog.duration = Date.now() - startTime;
            await syncLog.save();

            contact.syncStatus = 'error';
            await contact.save();

            logger.error(`Failed to sync contact ${contact._id} to HubSpot:`, error);
            throw error;
        }
    }

    // Sync a HubSpot contact to local database
    async syncContactFromHubSpot(hubspotId) {
        const startTime = Date.now();
        let contact = await Contact.findOne({ hubspotId });

        const hubspotContact = await hubSpotService.getContact(hubspotId);

        const syncLog = new SyncLog({
            entityType: 'contact',
            hubspotId,
            action: contact ? 'update' : 'create',
            direction: 'from_hubspot',
            status: 'pending',
            payload: hubspotContact,
        });

        try {
            if (contact) {
                // Check for conflicts
                const conflictInfo = conflictService.detectConflict(contact, hubspotContact);

                if (conflictInfo.hasConflict) {
                    await conflictService.createConflict('contact', contact, hubspotContact, conflictInfo);
                    contact.syncStatus = 'conflict';
                    await contact.save();

                    syncLog.entityId = contact._id;
                    syncLog.status = 'failed';
                    syncLog.errorMessage = 'Conflict detected';
                    syncLog.completedAt = new Date();
                    syncLog.duration = Date.now() - startTime;
                    await syncLog.save();

                    return { success: false, conflict: true };
                }

                // Update existing contact
                contact.email = hubspotContact.email || contact.email;
                contact.firstName = hubspotContact.firstName;
                contact.lastName = hubspotContact.lastName;
                contact.phone = hubspotContact.phone;
                contact.lastModifiedHubspot = hubspotContact.lastModifiedHubspot;
                contact.syncStatus = 'synced';
                contact.lastSyncedAt = new Date();
                contact.syncDirection = 'from_hubspot';
                await contact.save();
            } else {
                // Create new contact
                contact = new Contact({
                    hubspotId,
                    email: hubspotContact.email,
                    firstName: hubspotContact.firstName,
                    lastName: hubspotContact.lastName,
                    phone: hubspotContact.phone,
                    lastModifiedHubspot: hubspotContact.lastModifiedHubspot,
                    lastModifiedLocal: hubspotContact.lastModifiedHubspot,
                    syncStatus: 'synced',
                    lastSyncedAt: new Date(),
                    syncDirection: 'from_hubspot',
                });
                await contact.save();
            }

            syncLog.entityId = contact._id;
            syncLog.status = 'success';
            syncLog.completedAt = new Date();
            syncLog.duration = Date.now() - startTime;
            await syncLog.save();

            logger.info(`Synced contact ${hubspotId} from HubSpot`);
            return { success: true, contact };
        } catch (error) {
            syncLog.status = 'failed';
            syncLog.errorMessage = error.message;
            syncLog.errorStack = error.stack;
            syncLog.completedAt = new Date();
            syncLog.duration = Date.now() - startTime;
            await syncLog.save();

            if (contact) {
                contact.syncStatus = 'error';
                await contact.save();
            }

            logger.error(`Failed to sync contact ${hubspotId} from HubSpot:`, error);
            throw error;
        }
    }

    // Sync a local company to HubSpot
    async syncCompanyToHubSpot(companyId) {
        const startTime = Date.now();
        const company = await Company.findById(companyId);

        if (!company) {
            throw new Error('Company not found');
        }

        const syncLog = new SyncLog({
            entityType: 'company',
            entityId: company._id,
            hubspotId: company.hubspotId,
            action: company.hubspotId ? 'update' : 'create',
            direction: 'to_hubspot',
            status: 'pending',
            payload: company.toObject(),
        });

        try {
            let result;

            if (company.hubspotId) {
                const hubspotCompany = await hubSpotService.getCompany(company.hubspotId);
                const conflictInfo = conflictService.detectConflict(company, hubspotCompany);

                if (conflictInfo.hasConflict) {
                    await conflictService.createConflict('company', company, hubspotCompany, conflictInfo);
                    company.syncStatus = 'conflict';
                    await company.save();

                    syncLog.status = 'failed';
                    syncLog.errorMessage = 'Conflict detected';
                    syncLog.completedAt = new Date();
                    syncLog.duration = Date.now() - startTime;
                    await syncLog.save();

                    return { success: false, conflict: true };
                }

                result = await hubSpotService.updateCompany(company.hubspotId, company);
            } else {
                result = await hubSpotService.createCompany(company);
                company.hubspotId = result.hubspotId;
            }

            company.syncStatus = 'synced';
            company.lastSyncedAt = new Date();
            company.lastModifiedHubspot = result.lastModifiedHubspot || new Date();
            company.syncDirection = 'to_hubspot';
            await company.save();

            syncLog.hubspotId = company.hubspotId;
            syncLog.status = 'success';
            syncLog.response = result;
            syncLog.completedAt = new Date();
            syncLog.duration = Date.now() - startTime;
            await syncLog.save();

            logger.info(`Synced company ${company._id} to HubSpot`);
            return { success: true, company };
        } catch (error) {
            syncLog.status = 'failed';
            syncLog.errorMessage = error.message;
            syncLog.errorStack = error.stack;
            syncLog.completedAt = new Date();
            syncLog.duration = Date.now() - startTime;
            await syncLog.save();

            company.syncStatus = 'error';
            await company.save();

            logger.error(`Failed to sync company ${company._id} to HubSpot:`, error);
            throw error;
        }
    }

    // Sync a HubSpot company to local database
    async syncCompanyFromHubSpot(hubspotId) {
        const startTime = Date.now();
        let company = await Company.findOne({ hubspotId });

        const hubspotCompany = await hubSpotService.getCompany(hubspotId);

        const syncLog = new SyncLog({
            entityType: 'company',
            hubspotId,
            action: company ? 'update' : 'create',
            direction: 'from_hubspot',
            status: 'pending',
            payload: hubspotCompany,
        });

        try {
            if (company) {
                const conflictInfo = conflictService.detectConflict(company, hubspotCompany);

                if (conflictInfo.hasConflict) {
                    await conflictService.createConflict('company', company, hubspotCompany, conflictInfo);
                    company.syncStatus = 'conflict';
                    await company.save();

                    syncLog.entityId = company._id;
                    syncLog.status = 'failed';
                    syncLog.errorMessage = 'Conflict detected';
                    syncLog.completedAt = new Date();
                    syncLog.duration = Date.now() - startTime;
                    await syncLog.save();

                    return { success: false, conflict: true };
                }

                company.name = hubspotCompany.name;
                company.domain = hubspotCompany.domain;
                company.industry = hubspotCompany.industry;
                company.lastModifiedHubspot = hubspotCompany.lastModifiedHubspot;
                company.syncStatus = 'synced';
                company.lastSyncedAt = new Date();
                company.syncDirection = 'from_hubspot';
                await company.save();
            } else {
                company = new Company({
                    hubspotId,
                    name: hubspotCompany.name,
                    domain: hubspotCompany.domain,
                    industry: hubspotCompany.industry,
                    lastModifiedHubspot: hubspotCompany.lastModifiedHubspot,
                    lastModifiedLocal: hubspotCompany.lastModifiedHubspot,
                    syncStatus: 'synced',
                    lastSyncedAt: new Date(),
                    syncDirection: 'from_hubspot',
                });
                await company.save();
            }

            syncLog.entityId = company._id;
            syncLog.status = 'success';
            syncLog.completedAt = new Date();
            syncLog.duration = Date.now() - startTime;
            await syncLog.save();

            logger.info(`Synced company ${hubspotId} from HubSpot`);
            return { success: true, company };
        } catch (error) {
            syncLog.status = 'failed';
            syncLog.errorMessage = error.message;
            syncLog.errorStack = error.stack;
            syncLog.completedAt = new Date();
            syncLog.duration = Date.now() - startTime;
            await syncLog.save();

            if (company) {
                company.syncStatus = 'error';
                await company.save();
            }

            logger.error(`Failed to sync company ${hubspotId} from HubSpot:`, error);
            throw error;
        }
    }

    // Apply conflict resolution to entity
    async applyConflictResolution(conflictId, resolution, resolvedBy) {
        const { conflict, mergedData } = await conflictService.resolveConflict(
            conflictId,
            resolution,
            resolvedBy
        );

        const Model = conflict.entityType === 'contact' ? Contact : Company;
        const entity = await Model.findById(conflict.entityId);

        if (!entity) {
            throw new Error('Entity not found');
        }

        // Apply merged data
        Object.assign(entity, mergedData);
        entity.syncStatus = 'pending';
        await entity.save();

        // Sync to HubSpot with the resolved data
        if (conflict.entityType === 'contact') {
            await this.syncContactToHubSpot(entity._id);
        } else {
            await this.syncCompanyToHubSpot(entity._id);
        }

        return entity;
    }

    // Get sync statistics
    async getSyncStats() {
        const [contactStats, companyStats, logStats] = await Promise.all([
            Contact.aggregate([
                { $group: { _id: '$syncStatus', count: { $sum: 1 } } }
            ]),
            Company.aggregate([
                { $group: { _id: '$syncStatus', count: { $sum: 1 } } }
            ]),
            SyncLog.aggregate([
                { $match: { createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]),
        ]);

        const formatStats = (stats) => {
            return stats.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, { synced: 0, pending: 0, conflict: 0, error: 0 });
        };

        return {
            contacts: formatStats(contactStats),
            companies: formatStats(companyStats),
            recentLogs: formatStats(logStats),
        };
    }
}

const syncService = new SyncService();

module.exports = { SyncService, syncService };
