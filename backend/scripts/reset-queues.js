const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { syncToHubspotQueue, syncFromHubspotQueue, pollingSyncQueue } = require('../src/queues/syncQueue');
const { Contact } = require('../src/models');
const connectDB = require('../src/config/database');
const logger = require('../src/utils/logger');

const resetQueues = async () => {
    try {
        await connectDB();
        console.log('Connected to DB');

        console.log('--- Current Queue Counts ---');
        console.log('SyncToHubspot:', await syncToHubspotQueue.getJobCounts());
        console.log('SyncFromHubspot:', await syncFromHubspotQueue.getJobCounts());
        console.log('Polling:', await pollingSyncQueue.getJobCounts());

        console.log('--- Obliterating Queues ---');
        await syncToHubspotQueue.obliterate({ force: true });
        await syncFromHubspotQueue.obliterate({ force: true });
        // Don't obliterate polling queue as it might be running, just clean it
        await pollingSyncQueue.clean(0, 'failed');

        console.log('Queues cleared.');

        console.log('--- Re-queueing Pending Contacts ---');
        const pendingContacts = await Contact.find({ syncStatus: 'pending' });
        console.log(`Found ${pendingContacts.length} pending contacts.`);

        for (const contact of pendingContacts) {
            console.log(`Re-queueing contact ${contact._id}`);
            // Manually add job matching the structure in syncQueue.js
            await syncToHubspotQueue.add({
                entityType: 'contact',
                entityId: contact._id.toString(),
            }, {
                priority: 1, // High priority
                jobId: `rescue-${contact._id}-${Date.now()}`
            });
        }

        console.log('Done.');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

resetQueues();
