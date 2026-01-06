import React, { useState, useEffect } from 'react';
import { companiesApi, syncApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import CompanyForm from './CompanyForm';

const CompaniesList = () => {
    const [companies, setCompanies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingCompany, setEditingCompany] = useState(null);
    const toast = useToast();

    useEffect(() => {
        fetchCompanies();
    }, [pagination.page, search, statusFilter]);

    const fetchCompanies = async () => {
        setLoading(true);
        try {
            const params = { page: pagination.page, limit: 15 };
            if (search) params.search = search;
            if (statusFilter) params.syncStatus = statusFilter;

            const res = await companiesApi.getAll(params);
            setCompanies(res.data.data);
            setPagination(res.data.pagination);
        } catch (error) {
            toast.error('Failed to fetch companies');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = () => {
        setEditingCompany(null);
        setShowForm(true);
    };

    const handleEdit = (company) => {
        setEditingCompany(company);
        setShowForm(true);
    };

    const handleDelete = async (company) => {
        if (!confirm(`Delete ${company.name}?`)) return;

        try {
            await companiesApi.delete(company._id);
            toast.success('Company deleted');
            fetchCompanies();
        } catch (error) {
            toast.error('Failed to delete company');
        }
    };

    const handleSync = async (company) => {
        try {
            await syncApi.syncEntity('company', company._id);
            toast.success('Sync queued');
            setTimeout(fetchCompanies, 1000);
        } catch (error) {
            toast.error('Failed to queue sync');
        }
    };

    const handleFormSubmit = async (data) => {
        try {
            if (editingCompany) {
                await companiesApi.update(editingCompany._id, data);
                toast.success('Company updated');
            } else {
                await companiesApi.create(data);
                toast.success('Company created');
            }
            setShowForm(false);
            fetchCompanies();
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
        return <span className={`badge ${classes[status] || ''}`}>{status}</span>;
    };

    return (
        <div>
            <div className="card-header mb-lg">
                <h1 className="card-title" style={{ fontSize: '1.5rem' }}>Companies</h1>
                <button className="btn btn-primary" onClick={handleCreate}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add Company
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
                        placeholder="Search by name or domain..."
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
                            <th>Domain</th>
                            <th>Industry</th>
                            <th>Sync Status</th>
                            <th>Last Modified</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan="6" className="text-center">
                                    <div className="loading-overlay"><div className="spinner"></div></div>
                                </td>
                            </tr>
                        ) : companies.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="text-center text-muted">No companies found</td>
                            </tr>
                        ) : (
                            companies.map((company) => (
                                <tr key={company._id}>
                                    <td>{company.name}</td>
                                    <td>{company.domain || '-'}</td>
                                    <td>{company.industry || '-'}</td>
                                    <td>{getSyncStatusBadge(company.syncStatus)}</td>
                                    <td>{new Date(company.lastModifiedLocal).toLocaleString()}</td>
                                    <td>
                                        <div className="flex gap-sm">
                                            <button className="btn btn-sm btn-secondary" onClick={() => handleEdit(company)} title="Edit">✏️</button>
                                            <button className="btn btn-sm btn-secondary" onClick={() => handleSync(company)} title="Sync">🔄</button>
                                            <button className="btn btn-sm btn-danger" onClick={() => handleDelete(company)} title="Delete">🗑️</button>
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
                    <button disabled={pagination.page === 1} onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}>Previous</button>
                    <span>Page {pagination.page} of {pagination.pages}</span>
                    <button disabled={pagination.page === pagination.pages} onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}>Next</button>
                </div>
            )}

            {showForm && (
                <CompanyForm
                    company={editingCompany}
                    onSubmit={handleFormSubmit}
                    onClose={() => setShowForm(false)}
                />
            )}
        </div>
    );
};

export default CompaniesList;
