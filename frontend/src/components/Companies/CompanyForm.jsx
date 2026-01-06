import React, { useState } from 'react';

const CompanyForm = ({ company, onSubmit, onClose }) => {
    const [formData, setFormData] = useState({
        name: company?.name || '',
        domain: company?.domain || '',
        industry: company?.industry || '',
    });
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSubmit(formData);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">{company ? 'Edit Company' : 'Add Company'}</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-group">
                            <label className="form-label">Company Name *</label>
                            <input
                                type="text"
                                name="name"
                                className="form-input"
                                value={formData.name}
                                onChange={handleChange}
                                required
                                placeholder="Acme Inc."
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Domain</label>
                            <input
                                type="text"
                                name="domain"
                                className="form-input"
                                value={formData.domain}
                                onChange={handleChange}
                                placeholder="acme.com"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Industry</label>
                            <input
                                type="text"
                                name="industry"
                                className="form-input"
                                value={formData.industry}
                                onChange={handleChange}
                                placeholder="Technology"
                            />
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? 'Saving...' : (company ? 'Update' : 'Create')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CompanyForm;
