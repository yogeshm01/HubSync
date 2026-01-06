const Queue = require('bull');
const { createRedisClient } = require('../config/redis');
const logger = require('../utils/logger');

// Create Redis client for Bull
const redisClient = createRedisClient();

// Create Bull queue options with shared Redis connection
const queueOptions = {
    createClient: (type) => {
        switch (type) {
            case 'client':
                return redisClient;
            case 'subscriber':
                return createRedisClient();
            case 'bclient':
                return createRedisClient();
            default:
                return redisClient;
        }
    },
    defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50,      // Keep last 50 failed jobs
        attempts: 5,
        backoff: {
            type: 'exponential',
            delay: 1000, // 1 second base delay
        },
    },
    settings: {
        lockDuration: 60000, // 60 seconds
        stalledInterval: 60000, // Check for stalled jobs every 60 seconds
        maxStalledCount: 3, // Allow a job to be re-processed up to 3 times if it stalls
    },
};

// Sync to HubSpot queue
const syncToHubspotQueue = new Queue('sync-to-hubspot', queueOptions);

// Sync from HubSpot queue (webhook events)
const syncFromHubspotQueue = new Queue('sync-from-hubspot', queueOptions);

// Polling/batch sync queue
const pollingSyncQueue = new Queue('polling-sync', queueOptions);

// Error logging
[syncToHubspotQueue, syncFromHubspotQueue, pollingSyncQueue].forEach(queue => {
    queue.on('error', (error) => {
        logger.error(`Queue error: ${queue.name}`, error);
    });

    queue.on('failed', (job, err) => {
        logger.error(`Job ${job.id} in ${queue.name} failed:`, err);
    });

    queue.on('stalled', (job) => {
        logger.warn(`Job ${job.id} in ${queue.name} stalled`);
    });
});

// Add a job to sync entity to HubSpot
const addSyncToHubspotJob = async (entityType, entityId, priority = 'normal') => {
    const jobOptions = {
        priority: priority === 'high' ? 1 : (priority === 'low' ? 3 : 2),
        jobId: `${entityType}-${entityId}-${Date.now()}`,
    };

    const job = await syncToHubspotQueue.add({
        entityType,
        entityId: entityId.toString(),
    }, jobOptions);

    logger.debug(`Added sync-to-hubspot job: ${job.id}`);
    return job;
};

// Add a job to sync entity from HubSpot
const addSyncFromHubspotJob = async (entityType, hubspotId, eventType = 'update') => {
    const job = await syncFromHubspotQueue.add({
        entityType,
        hubspotId,
        eventType,
    }, {
        jobId: `${entityType}-${hubspotId}-${Date.now()}`,
    });

    logger.debug(`Added sync-from-hubspot job: ${job.id}`);
    return job;
};

// Add a polling sync job
const addPollingSyncJob = async (entityType = 'all') => {
    const job = await pollingSyncQueue.add({
        entityType,
    }, {
        jobId: `polling-${entityType}-${Date.now()}`,
    });

    logger.debug(`Added polling-sync job: ${job.id}`);
    return job;
};

// Get queue statistics
const getQueueStats = async () => {
    const [toHubspotCounts, fromHubspotCounts, pollingCounts] = await Promise.all([
        syncToHubspotQueue.getJobCounts(),
        syncFromHubspotQueue.getJobCounts(),
        pollingSyncQueue.getJobCounts(),
    ]);

    return {
        syncToHubspot: toHubspotCounts,
        syncFromHubspot: fromHubspotCounts,
        pollingSyncQueue: pollingCounts,
    };
};

// Pause all queues
const pauseAllQueues = async () => {
    await Promise.all([
        syncToHubspotQueue.pause(),
        syncFromHubspotQueue.pause(),
        pollingSyncQueue.pause(),
    ]);
    logger.info('All queues paused');
};

// Resume all queues
const resumeAllQueues = async () => {
    await Promise.all([
        syncToHubspotQueue.resume(),
        syncFromHubspotQueue.resume(),
        pollingSyncQueue.resume(),
    ]);
    logger.info('All queues resumed');
};

// Clean old jobs from queues
const cleanQueues = async (olderThanMs = 24 * 60 * 60 * 1000) => {
    await Promise.all([
        syncToHubspotQueue.clean(olderThanMs, 'completed'),
        syncToHubspotQueue.clean(olderThanMs * 7, 'failed'),
        syncFromHubspotQueue.clean(olderThanMs, 'completed'),
        syncFromHubspotQueue.clean(olderThanMs * 7, 'failed'),
        pollingSyncQueue.clean(olderThanMs, 'completed'),
        pollingSyncQueue.clean(olderThanMs * 7, 'failed'),
    ]);
    logger.info('Queues cleaned');
};

module.exports = {
    syncToHubspotQueue,
    syncFromHubspotQueue,
    pollingSyncQueue,
    addSyncToHubspotJob,
    addSyncFromHubspotJob,
    addPollingSyncJob,
    getQueueStats,
    pauseAllQueues,
    resumeAllQueues,
    cleanQueues,
};
