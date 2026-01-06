import React, { useState } from 'react';
import { conflictsApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';

const ConflictResolver = ({ conflict, onResolved, onClose }) => {
    const [fieldChoices, setFieldChoices] = useState({});
    const [loading, setLoading] = useState(false);
    const toast = useToast();

    const fields = conflict.entityType === 'contact'
        ? ['email', 'firstName', 'lastName', 'phone']
        : ['name', 'domain', 'industry'];

    const handleFieldChoice = (field, choice) => {
        setFieldChoices((prev) => ({ ...prev, [field]: choice }));
    };

    const handleResolve = async (type) => {
        setLoading(true);
        try {
            const data = { type };
            if (type === 'merged') {
                // Ensure all conflicting fields have a choice
                const allChosen = conflict.conflictingFields.every((f) => fieldChoices[f]);
                if (!allChosen) {
                    toast.warning('Please choose a value for all conflicting fields');
                    setLoading(false);
                    return;
                }
                data.fieldChoices = fieldChoices;
            }
            await conflictsApi.resolve(conflict._id, data);
            onResolved();
        } catch (error) {
            toast.error('Failed to resolve conflict');
        } finally {
            setLoading(false);
        }
    };

    const isConflicting = (field) => conflict.conflictingFields.includes(field);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" style={{ maxWidth: '800px' }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Resolve Conflict</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body">
                    <p className="text-muted mb-lg">
                        Compare the local and HubSpot versions below. Conflicting fields are highlighted.
                    </p>

                    <div className="conflict-compare">
                        {/* Local Version */}
                        <div className="conflict-panel local">
                            <div className="conflict-panel-header">📁 Local Version</div>
                            {fields.map((field) => (
                                <div key={field} className={`conflict-field ${isConflicting(field) ? 'different' : ''}`}>
                                    <div style={{ flex: 1 }}>
                                        <div className="field-label">{field}</div>
                                        <div className="field-value">{conflict.localVersion?.[field] || '-'}</div>
                                    </div>
                                    {isConflicting(field) && (
                                        <input
                                            type="radio"
                                            name={`field-${field}`}
                                            checked={fieldChoices[field] === 'local'}
                                            onChange={() => handleFieldChoice(field, 'local')}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* HubSpot Version */}
                        <div className="conflict-panel hubspot">
                            <div className="conflict-panel-header">☁️ HubSpot Version</div>
                            {fields.map((field) => (
                                <div key={field} className={`conflict-field ${isConflicting(field) ? 'different' : ''}`}>
                                    {isConflicting(field) && (
                                        <input
                                            type="radio"
                                            name={`field-${field}`}
                                            checked={fieldChoices[field] === 'hubspot'}
                                            onChange={() => handleFieldChoice(field, 'hubspot')}
                                        />
                                    )}
                                    <div style={{ flex: 1, textAlign: 'right' }}>
                                        <div className="field-label">{field}</div>
                                        <div className="field-value">{conflict.hubspotVersion?.[field] || '-'}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ marginTop: 'var(--spacing-lg)', padding: 'var(--spacing-md)', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)' }}>
                        <strong className="text-muted">Timestamps:</strong>
                        <div className="flex justify-between mt-sm">
                            <span>Local: {new Date(conflict.localTimestamp).toLocaleString()}</span>
                            <span>HubSpot: {new Date(conflict.hubspotTimestamp).toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={() => handleResolve('keep_local')} disabled={loading}>
                        Keep Local
                    </button>
                    <button className="btn btn-secondary" onClick={() => handleResolve('keep_hubspot')} disabled={loading}>
                        Keep HubSpot
                    </button>
                    <button className="btn btn-primary" onClick={() => handleResolve('merged')} disabled={loading}>
                        {loading ? 'Resolving...' : 'Merge Selected'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConflictResolver;
