import React, { useState, useEffect } from 'react';
import { conflictsApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import ConflictResolver from './ConflictResolver';

const ConflictsList = () => {
    const [conflicts, setConflicts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
    const [selectedConflict, setSelectedConflict] = useState(null);
    const toast = useToast();

    useEffect(() => {
        fetchConflicts();
    }, [pagination.page]);

    const fetchConflicts = async () => {
        setLoading(true);
        try {
            const res = await conflictsApi.getAll({ page: pagination.page, limit: 15 });
            setConflicts(res.data.data);
            setPagination(res.data.pagination);
        } catch (error) {
            toast.error('Failed to fetch conflicts');
        } finally {
            setLoading(false);
        }
    };

    const handleResolve = (conflict) => {
        setSelectedConflict(conflict);
    };

    const handleResolved = () => {
        setSelectedConflict(null);
        fetchConflicts();
        toast.success('Conflict resolved');
    };

    const handleQuickResolve = async (conflict, type) => {
        try {
            await conflictsApi.resolve(conflict._id, { type });
            toast.success(`Conflict resolved: ${type === 'keep_local' ? 'Kept local' : 'Kept HubSpot'}`);
            fetchConflicts();
        } catch (error) {
            toast.error('Failed to resolve conflict');
        }
    };

    return (
        <div>
            <div className="card-header mb-lg">
                <h1 className="card-title" style={{ fontSize: '1.5rem' }}>Conflicts</h1>
                <span className="badge badge-conflict">{pagination.total} unresolved</span>
            </div>

            {loading ? (
                <div className="loading-overlay"><div className="spinner"></div></div>
            ) : conflicts.length === 0 ? (
                <div className="card text-center" style={{ padding: 'var(--spacing-2xl)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-md)' }}>✓</div>
                    <h3 style={{ color: 'var(--color-success)' }}>No Conflicts</h3>
                    <p className="text-muted">All records are in sync!</p>
                </div>
            ) : (
                <>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>Record</th>
                                    <th>Conflicting Fields</th>
                                    <th>Detected</th>
                                    <th>Priority</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {conflicts.map((conflict) => (
                                    <tr key={conflict._id}>
                                        <td>
                                            <span className="badge" style={{ background: 'var(--color-primary-light)', color: 'white' }}>
                                                {conflict.entityType}
                                            </span>
                                        </td>
                                        <td>
                                            {conflict.localVersion?.email || conflict.localVersion?.name || conflict.hubspotId}
                                        </td>
                                        <td>
                                            {conflict.conflictingFields.map((field) => (
                                                <span key={field} className="badge badge-conflict" style={{ marginRight: '4px' }}>
                                                    {field}
                                                </span>
                                            ))}
                                        </td>
                                        <td>{new Date(conflict.detectedAt).toLocaleString()}</td>
                                        <td>
                                            <span className={`badge ${conflict.priority === 'high' ? 'badge-error' : 'badge-pending'}`}>
                                                {conflict.priority}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="flex gap-sm">
                                                <button className="btn btn-sm btn-primary" onClick={() => handleResolve(conflict)}>
                                                    Resolve
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-secondary"
                                                    onClick={() => handleQuickResolve(conflict, 'keep_local')}
                                                    title="Keep Local"
                                                >
                                                    ⬅️
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-secondary"
                                                    onClick={() => handleQuickResolve(conflict, 'keep_hubspot')}
                                                    title="Keep HubSpot"
                                                >
                                                    ➡️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {pagination.pages > 1 && (
                        <div className="pagination">
                            <button disabled={pagination.page === 1} onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}>Previous</button>
                            <span>Page {pagination.page} of {pagination.pages}</span>
                            <button disabled={pagination.page === pagination.pages} onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}>Next</button>
                        </div>
                    )}
                </>
            )}

            {selectedConflict && (
                <ConflictResolver
                    conflict={selectedConflict}
                    onResolved={handleResolved}
                    onClose={() => setSelectedConflict(null)}
                />
            )}
        </div>
    );
};

export default ConflictsList;
