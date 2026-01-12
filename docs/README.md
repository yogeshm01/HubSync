# HubSpot Bidirectional Data Synchronization Tool

A full-stack application for maintaining consistent, reliable, and up-to-date contact and company data between a custom application and HubSpot CRM. Features bidirectional sync, conflict detection and resolution, webhook integration, and a comprehensive dashboard.

## Features

- **Bidirectional Sync**: Two-way synchronization between local database and HubSpot CRM
- **Conflict Detection**: Automatic detection with field-level comparison
- **Conflict Resolution UI**: Side-by-side comparison with merge capabilities
- **Webhook Integration**: Real-time updates from HubSpot
- **Polling Fallback**: Scheduled sync when webhooks are unavailable
- **Rate Limiting**: Token bucket implementation respecting HubSpot's 100 req/10s limit
- **Job Queue**: Bull queue with retry logic and exponential backoff
- **Real-time Updates**: WebSocket notifications for sync status

[![Watch the video]()](https://drive.google.com/file/d/1VbTs3Aw8dAQPBdYDKOfI73JLWPcnktFm/view?usp=sharing)


## Tech Stack

### Backend
- Node.js + Express
- MongoDB (Mongoose ODM)
- Redis + Bull (Job Queue)
- Socket.io (WebSockets)
- @hubspot/api-client (HubSpot SDK)

### Frontend
- React 18 + Vite
- React Router
- Socket.io-client
- Axios

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Redis (local or cloud)
- HubSpot Developer Account

### 1. Clone and Install

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment

Copy the example env file and configure:

```bash
cd backend
cp .env.example .env
```

Edit `.env`:
```env
MONGODB_URI=mongodb://localhost:27017/hubspot-sync
REDIS_URL=redis://localhost:6379
HUBSPOT_ACCESS_TOKEN=your_private_app_token
HUBSPOT_WEBHOOK_SECRET=your_webhook_secret
PORT=3001
```

### 3. Get HubSpot Credentials

1. Go to [HubSpot Developer Portal](https://developers.hubspot.com/)
2. Create a Private App with scopes:
   - `crm.objects.contacts.read`
   - `crm.objects.contacts.write`
   - `crm.objects.companies.read`
   - `crm.objects.companies.write`
3. Copy the access token to `.env`

### 4. Start the Application

```bash
# Terminal 1: Start MongoDB (if local)
mongod

# Terminal 2: Start Redis (if local)
redis-server

# Terminal 3: Start backend
cd backend
npm run dev

# Terminal 4: Start frontend
cd frontend
npm run dev
```

Visit http://localhost:5173

## API Documentation

### Contacts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/contacts` | List contacts (supports `page`, `limit`, `search`, `syncStatus`) |
| GET | `/api/contacts/:id` | Get single contact |
| POST | `/api/contacts` | Create contact |
| PUT | `/api/contacts/:id` | Update contact |
| DELETE | `/api/contacts/:id` | Soft delete contact |

### Companies

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/companies` | List companies |
| GET | `/api/companies/:id` | Get single company |
| POST | `/api/companies` | Create company |
| PUT | `/api/companies/:id` | Update company |
| DELETE | `/api/companies/:id` | Soft delete company |

### Sync

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sync/status` | Get sync status and queue stats |
| POST | `/api/sync/trigger` | Trigger full sync from HubSpot |
| POST | `/api/sync/entity/:type/:id` | Sync specific entity |
| GET | `/api/sync/logs` | Get sync history |
| POST | `/api/sync/retry/:logId` | Retry failed sync |

### Conflicts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/conflicts` | List unresolved conflicts |
| GET | `/api/conflicts/:id` | Get conflict details |
| POST | `/api/conflicts/:id/resolve` | Resolve conflict |
| GET | `/api/conflicts/history` | Get resolved conflicts |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhooks/hubspot` | Receive HubSpot webhook events |
| GET | `/api/webhooks/hubspot` | Webhook verification |

## Architecture Decisions

### Conflict Resolution Strategy

Conflicts are detected by comparing `lastModifiedLocal` and `lastModifiedHubspot` timestamps against the last sync time. When both systems have modifications after the previous sync, a conflict is created with:

1. Field-level diff identifying which fields changed
2. Snapshots of both versions for comparison
3. Three resolution options: keep local, keep HubSpot, or field-by-field merge
4. Complete audit trail of detection and resolution

### Rate Limiting

Implements a token bucket algorithm with:
- 100 tokens, refilling every 10 seconds
- Queued requests wait for available tokens
- No request starvation - FIFO processing
- Status endpoint exposes current capacity

### Error Recovery

Uses exponential backoff with jitter:
- Base delay: 1 second
- Multiplier: 2x per retry
- Max delay: 32 seconds
- Max retries: 5 (configurable)
- Retryable errors: 429, 5xx, network failures

### Performance Optimizations

1. **Batch Processing**: Polling sync processes records in batches of 100
2. **Concurrent Queue Processing**: Up to 5 concurrent jobs per queue
3. **Database Indexes**: Compound indexes on frequently queried fields
4. **TTL Index**: Auto-cleanup of old success logs after 30 days
5. **Connection Pooling**: MongoDB pool size of 10 connections

## Database Schema

### Contact
```javascript
{
  hubspotId: String,
  email: String (unique),
  firstName: String,
  lastName: String,
  phone: String,
  company: ObjectId,
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error',
  lastModifiedLocal: Date,
  lastModifiedHubspot: Date,
  lastSyncedAt: Date,
  version: Number
}
```

### Company
```javascript
{
  hubspotId: String,
  name: String,
  domain: String,
  industry: String,
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error',
  lastModifiedLocal: Date,
  lastModifiedHubspot: Date,
  lastSyncedAt: Date,
  version: Number
}
```

### SyncLog
```javascript
{
  entityType: 'contact' | 'company',
  entityId: ObjectId,
  action: 'create' | 'update' | 'delete',
  direction: 'to_hubspot' | 'from_hubspot',
  status: 'success' | 'failed' | 'pending' | 'retrying',
  retryCount: Number,
  errorMessage: String
}
```

### Conflict
```javascript
{
  entityType: 'contact' | 'company',
  entityId: ObjectId,
  localVersion: Object,
  hubspotVersion: Object,
  conflictingFields: [String],
  resolutionType: 'pending' | 'keep_local' | 'keep_hubspot' | 'merged',
  resolvedBy: String,
  auditLog: [{ action, timestamp, user, details }]
}
```

## Webhook Setup

For production, configure HubSpot webhooks to POST to:
```
https://your-domain.com/api/webhooks/hubspot
```

Subscribe to events:
- `contact.creation`
- `contact.propertyChange`
- `contact.deletion`
- `company.creation`
- `company.propertyChange`
- `company.deletion`

For local development, use ngrok:
```bash
ngrok http 3001
```

## License

MIT
