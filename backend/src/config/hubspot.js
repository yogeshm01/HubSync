const hubspot = require('@hubspot/api-client');

const createHubSpotClient = () => {
    return new hubspot.Client({
        accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
    });
};

module.exports = { createHubSpotClient };
