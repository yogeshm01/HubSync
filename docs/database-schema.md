# Database Schema Documentation

## Overview

The application uses MongoDB with Mongoose ODM. The schema design prioritizes:
- Efficient conflict detection with timestamp indexing
- Audit trail preservation
- Soft deletes for data recovery
- Version tracking for optimistic locking

## Collections

### 1. Contacts

Stores contact records synchronized with HubSpot.

```javascript
{
  _id: ObjectId,
  hubspotId: String,              // HubSpot record ID (indexed, sparse)
  email: String,                  // Required, unique, lowercase
  firstName: String,
  lastName: String,
  phone: String,
  company: ObjectId,              // Reference to Company (indexed)
  customFields: Map<String, Any>, // Flexible custom properties
  
  // Sync metadata
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error',
  lastModifiedLocal: Date,        // Last local modification (indexed)
  lastModifiedHubspot: Date,      // Last HubSpot modification
  lastSyncedAt: Date,             // Last successful sync
  syncDirection: 'to_hubspot' | 'from_hubspot' | 'bidirectional',
  version: Number,                // Increments on each save
  
  isDeleted: Boolean,             // Soft delete flag
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `{ email: 1 }` - unique
- `{ hubspotId: 1 }` - sparse
- `{ syncStatus: 1 }`
- `{ company: 1 }`
- `{ lastModifiedLocal: 1, lastModifiedHubspot: 1 }` - compound for conflict detection

---

### 2. Companies

Stores company records synchronized with HubSpot.

```javascript
{
  _id: ObjectId,
  hubspotId: String,
  name: String,                   // Required
  domain: String,                 // Lowercase
  industry: String,
  customFields: Map<String, Any>,
  
  // Sync metadata (same as Contacts)
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error',
  lastModifiedLocal: Date,
  lastModifiedHubspot: Date,
  lastSyncedAt: Date,
  version: Number,
  isDeleted: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `{ name: 1 }`
- `{ domain: 1 }`
- `{ hubspotId: 1 }` - sparse
- `{ syncStatus: 1 }`

---

### 3. SyncLogs

Tracks all synchronization operations for auditing and debugging.

```javascript
{
  _id: ObjectId,
  entityType: 'contact' | 'company',
  entityId: ObjectId,             // Reference to synced entity
  hubspotId: String,
  action: 'create' | 'update' | 'delete',
  direction: 'to_hubspot' | 'from_hubspot',
  status: 'success' | 'failed' | 'pending' | 'retrying',
  
  // Error tracking
  errorMessage: String,
  errorStack: String,
  retryCount: Number,
  maxRetries: Number,
  nextRetryAt: Date,
  
  // Payloads
  payload: Object,                // Data sent/received
  response: Object,               // API response
  
  // Timing
  duration: Number,               // Milliseconds
  createdAt: Date,
  completedAt: Date
}
```

**Indexes:**
- `{ entityType: 1, entityId: 1, createdAt: -1 }` - compound
- `{ status: 1, createdAt: -1 }` - for failed job queries
- `{ status: 1, nextRetryAt: 1 }` - for retry scheduling
- `{ completedAt: 1 }` - TTL index (30 days for success logs)

---

### 4. Conflicts

Records data conflicts requiring manual resolution.

```javascript
{
  _id: ObjectId,
  entityType: 'contact' | 'company',
  entityId: ObjectId,
  hubspotId: String,
  
  // Version snapshots
  localVersion: Object,           // Full local record at conflict time
  hubspotVersion: Object,         // Full HubSpot record at conflict time
  conflictingFields: [String],    // List of differing fields
  
  // Timestamps
  localTimestamp: Date,           // Local modification time
  hubspotTimestamp: Date,         // HubSpot modification time
  detectedAt: Date,
  resolvedAt: Date,
  
  // Resolution
  resolutionType: 'pending' | 'keep_local' | 'keep_hubspot' | 'merged' | 'auto_resolved',
  resolvedBy: String,             // User identifier
  mergedData: Object,             // Final merged result
  
  // Audit
  priority: 'low' | 'medium' | 'high',
  auditLog: [{
    action: String,
    timestamp: Date,
    user: String,
    details: Object
  }],
  
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `{ resolutionType: 1, detectedAt: -1 }` - for pending conflicts
- `{ entityType: 1, resolutionType: 1 }` - for type-specific queries
- `{ entityType: 1, entityId: 1 }` - for entity lookup

---

## Relationships

```
┌─────────────┐         ┌─────────────┐
│   Contact   │────────▶│   Company   │
└─────────────┘         └─────────────┘
       │                       │
       │                       │
       ▼                       ▼
┌─────────────┐         ┌─────────────┐
│  SyncLog    │         │  SyncLog    │
└─────────────┘         └─────────────┘
       │                       │
       ▼                       ▼
┌─────────────┐         ┌─────────────┐
│  Conflict   │         │  Conflict   │
└─────────────┘         └─────────────┘
```

## Data Flow

1. **Create/Update in App** → Entity saved with `syncStatus: 'pending'` → Job queued
2. **Job Processor** → Fetches HubSpot version → Compares timestamps
3. **No Conflict** → Syncs data → Updates `syncStatus: 'synced'` + `lastSyncedAt`
4. **Conflict Detected** → Creates Conflict record → Updates `syncStatus: 'conflict'`
5. **User Resolution** → Applies merged data → Syncs to HubSpot → Clears conflict
