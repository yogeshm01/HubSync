import axios from 'axios';

const API_BASE = 'https://hubsync-ebgt.onrender.com/api';

const api = axios.create({
    baseURL: API_BASE,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Response interceptor for error handling
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const message = error.response?.data?.error || error.message || 'An error occurred';
        console.error('API Error:', message);
        return Promise.reject(error);
    }
);

// Contacts API
export const contactsApi = {
    getAll: (params = {}) => api.get('/contacts', { params }),
    getById: (id) => api.get(`/contacts/${id}`),
    create: (data) => api.post('/contacts', data),
    update: (id, data) => api.put(`/contacts/${id}`, data),
    delete: (id) => api.delete(`/contacts/${id}`),
};

// Companies API
export const companiesApi = {
    getAll: (params = {}) => api.get('/companies', { params }),
    getById: (id) => api.get(`/companies/${id}`),
    create: (data) => api.post('/companies', data),
    update: (id, data) => api.put(`/companies/${id}`, data),
    delete: (id) => api.delete(`/companies/${id}`),
};

// Sync API
export const syncApi = {
    getStatus: () => api.get('/sync/status'),
    trigger: (entityType = 'all') => api.post('/sync/trigger', { entityType }),
    syncEntity: (type, id) => api.post(`/sync/entity/${type}/${id}`),
    getLogs: (params = {}) => api.get('/sync/logs', { params }),
    retry: (logId) => api.post(`/sync/retry/${logId}`),
    getPending: (type) => api.get('/sync/pending', { params: { type } }),
};

// Conflicts API
export const conflictsApi = {
    getAll: (params = {}) => api.get('/conflicts', { params }),
    getCounts: () => api.get('/conflicts/counts'),
    getById: (id) => api.get(`/conflicts/${id}`),
    resolve: (id, data) => api.post(`/conflicts/${id}/resolve`, data),
    getHistory: (params = {}) => api.get('/conflicts/history', { params }),
};

export default api;
