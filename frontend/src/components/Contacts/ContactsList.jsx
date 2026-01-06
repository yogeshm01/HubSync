import React, { useState, useEffect } from 'react';
import { contactsApi, companiesApi, syncApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import ContactForm from './ContactForm';

const ContactsList = () => {
    const [contacts, setContacts] = useState([]);
    const [companies, setCompanies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingContact, setEditingContact] = useState(null);
    const toast = useToast();

    useEffect(() => {
        fetchCompanies();
    }, []);

    useEffect(() => {
        fetchContacts();
    }, [pagination.page, search, statusFilter]);

    const fetchCompanies = async () => {
        try {
            const res = await companiesApi.getAll({ limit: 100 });
            setCompanies(res.data.data);
        } catch (error) {
            console.error('Failed to fetch companies:', error);
        }
    };

    const fetchContacts = async () => {
        setLoading(true);
        try {
            const params = { page: pagination.page, limit: 15 };
            if (search) params.search = search;
            if (statusFilter) params.syncStatus = statusFilter;

            const res = await contactsApi.getAll(params);
            setContacts(res.data.data);
            setPagination(res.data.pagination);
        } catch (error) {
            toast.error('Failed to fetch contacts');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = () => {
        setEditingContact(null);
        setShowForm(true);
    };

    const handleEdit = (contact) => {
        setEditingContact(contact);
        setShowForm(true);
    };

    const handleDelete = async (contact) => {
        if (!confirm(`Delete ${contact.email}?`)) return;

        try {
            await contactsApi.delete(contact._id);
            toast.success('Contact deleted');
            fetchContacts();
        } catch (error) {
            toast.error('Failed to delete contact');
        }
    };

    const handleSync = async (contact) => {
        try {
            await syncApi.syncEntity('contact', contact._id);
            toast.success('Sync queued');
            setTimeout(fetchContacts, 1000);
        } catch (error) {
            toast.error('Failed to queue sync');
        }
    };

    const handleFormSubmit = async (data) => {
        try {
            if (editingContact) {
                await contactsApi.update(editingContact._id, data);
                toast.success('Contact updated');
            } else {
                await contactsApi.create(data);
                toast.success('Contact created');
            }
            setShowForm(false);
            fetchContacts();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Operation failed');
        }
    };

    const getSyncStatusBadge = (status) => {
        const classes = {
            synced: 'badge-synced',
            pending: 'badge-pending',
            conflict: 'badge-conflict',
            error: 'badge-error',
        };
        return (
            <span className={`badge ${classes[status] || ''}`}>
                {status}
            </span>
        );
    };

    return (
        <div>
            <div className="card-header mb-lg">
                <h1 className="card-title" style={{ fontSize: '1.5rem' }}>Contacts</h1>
                <button className="btn btn-primary" onClick={handleCreate}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add Contact
                </button>
            </div>

            {/* Search and Filters */}
            <div className="flex gap-md mb-lg">
                <div className="search-bar" style={{ flex: 1 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search by name or email..."
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPagination({ ...pagination, page: 1 });
                        }}
                    />
                </div>
                <select
                    className="form-input"
                    style={{ width: '150px' }}
                    value={statusFilter}
                    onChange={(e) => {
                        setStatusFilter(e.target.value);
                        setPagination({ ...pagination, page: 1 });
                    }}
                >
                    <option value="">All Status</option>
                    <option value="synced">Synced</option>
                    <option value="pending">Pending</option>
                    <option value="conflict">Conflict</option>
                    <option value="error">Error</option>
                </select>
            </div>

            {/* Table */}
            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Phone</th>
                            <th>Company</th>
                            <th>Sync Status</th>
                            <th>Last Modified</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan="7" className="text-center">
                                    <div className="loading-overlay">
                                        <div className="spinner"></div>
                                    </div>
                                </td>
                            </tr>
                        ) : contacts.length === 0 ? (
                            <tr>
                                <td colSpan="7" className="text-center text-muted">
                                    No contacts found
                                </td>
                            </tr>
                        ) : (
                            contacts.map((contact) => (
                                <tr key={contact._id}>
                                    <td>{contact.firstName} {contact.lastName}</td>
                                    <td>{contact.email}</td>
                                    <td>{contact.phone || '-'}</td>
                                    <td>{contact.company?.name || '-'}</td>
                                    <td>{getSyncStatusBadge(contact.syncStatus)}</td>
                                    <td>{new Date(contact.lastModifiedLocal).toLocaleString()}</td>
                                    <td>
                                        <div className="flex gap-sm">
                                            <button
                                                className="btn btn-sm btn-secondary"
                                                onClick={() => handleEdit(contact)}
                                                title="Edit"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                className="btn btn-sm btn-secondary"
                                                onClick={() => handleSync(contact)}
                                                title="Sync"
                                            >
                                                🔄
                                            </button>
                                            <button
                                                className="btn btn-sm btn-danger"
                                                onClick={() => handleDelete(contact)}
                                                title="Delete"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
                <div className="pagination">
                    <button
                        disabled={pagination.page === 1}
                        onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                    >
                        Previous
                    </button>
                    <span>Page {pagination.page} of {pagination.pages}</span>
                    <button
                        disabled={pagination.page === pagination.pages}
                        onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                    >
                        Next
                    </button>
                </div>
            )}

            {/* Form Modal */}
            {showForm && (
                <ContactForm
                    contact={editingContact}
                    companies={companies}
                    onSubmit={handleFormSubmit}
                    onClose={() => setShowForm(false)}
                />
            )}
        </div>
    );
};

export default ContactsList;
