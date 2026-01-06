import React, { useState, useEffect } from 'react';
import { syncApi, conflictsApi } from '../../services/api';

const Dashboard = () => {
    const [status, setStatus] = useState(null);
    const [conflictCounts, setConflictCounts] = useState(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [statusRes, conflictRes] = await Promise.all([
                syncApi.getStatus(),
                conflictsApi.getCounts(),
            ]);
            setStatus(statusRes.data.data);
            setConflictCounts(conflictRes.data.data);
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleTriggerSync = async () => {
        setSyncing(true);
        try {
            await syncApi.trigger('all');
            // Refresh after a short delay
            setTimeout(fetchData, 2000);
        } catch (error) {
            console.error('Failed to trigger sync:', error);
        } finally {
            setSyncing(false);
        }
    };

    if (loading) {
        return (
            <div className="loading-overlay">
                <div className="spinner"></div>
            </div>
        );
    }

    const entities = status?.entities || {};
    const queues = status?.queues || {};

    return (
        <div>
            <div className="card-header mb-lg">
                <h1 className="card-title" style={{ fontSize: '1.5rem' }}>Dashboard</h1>
                <button
                    className="btn btn-primary"
                    onClick={handleTriggerSync}
                    disabled={syncing}
                >
                    {syncing ? (
                        <>
                            <div className="spinner"></div>
                            Syncing...
                        </>
                    ) : (
                        <>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 12a9 9 0 11-9-9c2.52 0 4.83 1.04 6.48 2.73" />
                                <path d="M21 3v6h-6" />
                            </svg>
                            Trigger Full Sync
                        </>
                    )}
                </button>
            </div>

            {/* Stats Grid */}
            <div className="stats-grid">
                <div className="stat-card success">
                    <div className="stat-value">{(entities.contacts?.synced || 0) + (entities.companies?.synced || 0)}</div>
                    <div className="stat-label">Synced Records</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{(entities.contacts?.pending || 0) + (entities.companies?.pending || 0)}</div>
                    <div className="stat-label">Pending Sync</div>
                </div>
                <div className="stat-card warning">
                    <div className="stat-value">{conflictCounts?.pending || 0}</div>
                    <div className="stat-label">Unresolved Conflicts</div>
                </div>
                <div className="stat-card error">
                    <div className="stat-value">{(entities.contacts?.error || 0) + (entities.companies?.error || 0)}</div>
                    <div className="stat-label">Sync Errors</div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-lg)' }}>
                {/* Contacts Status */}
                <div className="card">
                    <h3 className="card-title mb-md">Contacts</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                        <div className="flex justify-between items-center">
                            <span className="text-muted">Synced</span>
                            <span className="badge badge-synced">{entities.contacts?.synced || 0}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted">Pending</span>
                            <span className="badge badge-pending">{entities.contacts?.pending || 0}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted">Conflicts</span>
                            <span className="badge badge-conflict">{entities.contacts?.conflict || 0}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted">Errors</span>
                            <span className="badge badge-error">{entities.contacts?.error || 0}</span>
                        </div>
                    </div>
                </div>

                {/* Companies Status */}
                <div className="card">
                    <h3 className="card-title mb-md">Companies</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                        <div className="flex justify-between items-center">
                            <span className="text-muted">Synced</span>
                            <span className="badge badge-synced">{entities.companies?.synced || 0}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted">Pending</span>
                            <span className="badge badge-pending">{entities.companies?.pending || 0}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted">Conflicts</span>
                            <span className="badge badge-conflict">{entities.companies?.conflict || 0}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted">Errors</span>
                            <span className="badge badge-error">{entities.companies?.error || 0}</span>
                        </div>
                    </div>
                </div>

                {/* Queue Status */}
                <div className="card">
                    <h3 className="card-title mb-md">Queue Status</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                        <div className="flex justify-between items-center">
                            <span className="text-muted">Waiting</span>
                            <span>{(queues.syncToHubspot?.waiting || 0) + (queues.syncFromHubspot?.waiting || 0)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted">Active</span>
                            <span>{(queues.syncToHubspot?.active || 0) + (queues.syncFromHubspot?.active || 0)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted">Completed</span>
                            <span>{(queues.syncToHubspot?.completed || 0) + (queues.syncFromHubspot?.completed || 0)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted">Failed</span>
                            <span className="text-error">{(queues.syncToHubspot?.failed || 0) + (queues.syncFromHubspot?.failed || 0)}</span>
                        </div>
                    </div>
                </div>

                {/* Rate Limit Status */}
                <div className="card">
                    <h3 className="card-title mb-md">Rate Limit</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                        <div className="flex justify-between items-center">
                            <span className="text-muted">Available Tokens</span>
                            <span>{status?.rateLimit?.availableTokens || 0} / {status?.rateLimit?.maxTokens || 100}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted">Queue Length</span>
                            <span>{status?.rateLimit?.queueLength || 0}</span>
                        </div>
                        <div style={{ marginTop: 'var(--spacing-sm)' }}>
                            <div style={{
                                height: '8px',
                                background: 'var(--color-bg)',
                                borderRadius: 'var(--radius-full)',
                                overflow: 'hidden'
                            }}>
                                <div style={{
                                    width: `${((status?.rateLimit?.availableTokens || 0) / (status?.rateLimit?.maxTokens || 100)) * 100}%`,
                                    height: '100%',
                                    background: 'var(--gradient-success)',
                                    transition: 'width 0.3s ease'
                                }}></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
