const { createHubSpotClient } = require('../config/hubspot');
const { hubspotRateLimiter } = require('./rateLimiter');
const { withRetry, isRetryableError } = require('../utils/retryHelper');
const logger = require('../utils/logger');

class HubSpotService {
    constructor() {
        this.client = null;
    }

    // Initialize the HubSpot client
    initialize() {
        this.client = createHubSpotClient();
        logger.info('HubSpot service initialized');
    }

    // Execute a HubSpot API call with rate limiting and retry
    async executeWithRateLimit(fn, context = 'HubSpot API call') {
        return hubspotRateLimiter.execute(async () => {
            return withRetry(fn, {
                maxRetries: 3,
                shouldRetry: isRetryableError,
                context,
            });
        }, context);
    }

    // ==================== CONTACTS ====================

    // Get a contact by HubSpot ID
    async getContact(hubspotId) {
        return this.executeWithRateLimit(async () => {
            const response = await this.client.crm.contacts.basicApi.getById(hubspotId, [
                'email', 'firstname', 'lastname', 'phone', 'company', 'hs_object_id'
            ]);
            return this.mapHubSpotContactToLocal(response);
        }, `getContact(${hubspotId})`);
    }

    // Create a contact in HubSpot
    async createContact(contactData) {
        return this.executeWithRateLimit(async () => {
            const properties = this.mapLocalContactToHubSpot(contactData);
            const response = await this.client.crm.contacts.basicApi.create({
                properties,
            });
            logger.info(`Created contact in HubSpot: ${response.id}`);
            return {
                hubspotId: response.id,
                ...this.mapHubSpotContactToLocal(response),
            };
        }, 'createContact');
    }

    // Update a contact in HubSpot
    async updateContact(hubspotId, contactData) {
        return this.executeWithRateLimit(async () => {
            const properties = this.mapLocalContactToHubSpot(contactData);
            const response = await this.client.crm.contacts.basicApi.update(hubspotId, {
                properties,
            });
            logger.info(`Updated contact in HubSpot: ${hubspotId}`);
            return this.mapHubSpotContactToLocal(response);
        }, `updateContact(${hubspotId})`);
    }

    // Delete a contact in HubSpot (archive)
    async deleteContact(hubspotId) {
        return this.executeWithRateLimit(async () => {
            await this.client.crm.contacts.basicApi.archive(hubspotId);
            logger.info(`Archived contact in HubSpot: ${hubspotId}`);
            return true;
        }, `deleteContact(${hubspotId})`);
    }

    // Search contacts in HubSpot
    async searchContacts(query, limit = 100, after = undefined) {
        return this.executeWithRateLimit(async () => {
            const response = await this.client.crm.contacts.searchApi.doSearch({
                query,
                limit,
                after,
                properties: ['email', 'firstname', 'lastname', 'phone', 'company', 'hs_object_id'],
            });
            return {
                results: response.results.map(c => this.mapHubSpotContactToLocal(c)),
                paging: response.paging,
                total: response.total,
            };
        }, `searchContacts(${query})`);
    }

    // Get all contacts (with pagination)
    async getAllContacts(limit = 100, after = undefined) {
        return this.executeWithRateLimit(async () => {
            const response = await this.client.crm.contacts.basicApi.getPage(
                limit,
                after,
                ['email', 'firstname', 'lastname', 'phone', 'company', 'hs_object_id', 'hs_lastmodifieddate']
            );
            return {
                results: response.results.map(c => this.mapHubSpotContactToLocal(c)),
                paging: response.paging,
            };
        }, 'getAllContacts');
    }

    // ==================== COMPANIES ====================

    // Get a company by HubSpot ID
    async getCompany(hubspotId) {
        return this.executeWithRateLimit(async () => {
            const response = await this.client.crm.companies.basicApi.getById(hubspotId, [
                'name', 'domain', 'industry', 'hs_object_id'
            ]);
            return this.mapHubSpotCompanyToLocal(response);
        }, `getCompany(${hubspotId})`);
    }

    // Create a company in HubSpot
    async createCompany(companyData) {
        return this.executeWithRateLimit(async () => {
            const properties = this.mapLocalCompanyToHubSpot(companyData);
            const response = await this.client.crm.companies.basicApi.create({
                properties,
            });
            logger.info(`Created company in HubSpot: ${response.id}`);
            return {
                hubspotId: response.id,
                ...this.mapHubSpotCompanyToLocal(response),
            };
        }, 'createCompany');
    }

    // Update a company in HubSpot
    async updateCompany(hubspotId, companyData) {
        return this.executeWithRateLimit(async () => {
            const properties = this.mapLocalCompanyToHubSpot(companyData);
            const response = await this.client.crm.companies.basicApi.update(hubspotId, {
                properties,
            });
            logger.info(`Updated company in HubSpot: ${hubspotId}`);
            return this.mapHubSpotCompanyToLocal(response);
        }, `updateCompany(${hubspotId})`);
    }

    // Delete a company in HubSpot (archive)
    async deleteCompany(hubspotId) {
        return this.executeWithRateLimit(async () => {
            await this.client.crm.companies.basicApi.archive(hubspotId);
            logger.info(`Archived company in HubSpot: ${hubspotId}`);
            return true;
        }, `deleteCompany(${hubspotId})`);
    }

    // Get all companies (with pagination)
    async getAllCompanies(limit = 100, after = undefined) {
        return this.executeWithRateLimit(async () => {
            const response = await this.client.crm.companies.basicApi.getPage(
                limit,
                after,
                ['name', 'domain', 'industry', 'hs_object_id', 'hs_lastmodifieddate']
            );
            return {
                results: response.results.map(c => this.mapHubSpotCompanyToLocal(c)),
                paging: response.paging,
            };
        }, 'getAllCompanies');
    }

    // ==================== MAPPING FUNCTIONS ====================

    // Map HubSpot contact to local format
    mapHubSpotContactToLocal(hubspotContact) {
        const props = hubspotContact.properties || {};
        return {
            hubspotId: hubspotContact.id,
            email: props.email || '',
            firstName: props.firstname || '',
            lastName: props.lastname || '',
            phone: props.phone || '',
            lastModifiedHubspot: props.hs_lastmodifieddate
                ? new Date(props.hs_lastmodifieddate)
                : new Date(hubspotContact.updatedAt),
        };
    }

    // Map local contact to HubSpot format
    mapLocalContactToHubSpot(contact) {
        const properties = {};
        if (contact.email) properties.email = contact.email;
        if (contact.firstName) properties.firstname = contact.firstName;
        if (contact.lastName) properties.lastname = contact.lastName;
        if (contact.phone) properties.phone = contact.phone;
        return properties;
    }

    // Map HubSpot company to local format
    mapHubSpotCompanyToLocal(hubspotCompany) {
        const props = hubspotCompany.properties || {};
        return {
            hubspotId: hubspotCompany.id,
            name: props.name || '',
            domain: props.domain || '',
            industry: props.industry || '',
            lastModifiedHubspot: props.hs_lastmodifieddate
                ? new Date(props.hs_lastmodifieddate)
                : new Date(hubspotCompany.updatedAt),
        };
    }

    // Map local company to HubSpot format
    mapLocalCompanyToHubSpot(company) {
        const properties = {};
        if (company.name) properties.name = company.name;
        if (company.domain) properties.domain = company.domain;
        if (company.industry) properties.industry = company.industry;
        return properties;
    }

    // Get rate limiter status
    getRateLimitStatus() {
        return hubspotRateLimiter.getStatus();
    }
}

// Singleton instance
const hubSpotService = new HubSpotService();

module.exports = { HubSpotService, hubSpotService };
