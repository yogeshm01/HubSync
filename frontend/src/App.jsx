import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { socketService } from './services/socket';

import Dashboard from './components/Dashboard/Dashboard';
import ContactsList from './components/Contacts/ContactsList';
import CompaniesList from './components/Companies/CompaniesList';
import ConflictsList from './components/Conflicts/ConflictsList';

const Sidebar = () => (
    <aside className="sidebar">
        <div className="sidebar-logo">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="url(#gradient)" strokeWidth="2">
                <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#4f46e5" />
                        <stop offset="100%" stopColor="#7c3aed" />
                    </linearGradient>
                </defs>
                <path d="M21 12a9 9 0 11-9-9c2.52 0 4.83 1.04 6.48 2.73" />
                <path d="M21 3v6h-6" />
            </svg>
            <h1>HubSync</h1>
        </div>

        <nav className="sidebar-nav">
            <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="9" />
                    <rect x="14" y="3" width="7" height="5" />
                    <rect x="14" y="12" width="7" height="9" />
                    <rect x="3" y="16" width="7" height="5" />
                </svg>
                Dashboard
            </NavLink>

            <NavLink to="/contacts" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                Contacts
            </NavLink>

            <NavLink to="/companies" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 21h18" />
                    <path d="M9 8h1" />
                    <path d="M9 12h1" />
                    <path d="M9 16h1" />
                    <path d="M14 8h1" />
                    <path d="M14 12h1" />
                    <path d="M14 16h1" />
                    <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
                </svg>
                Companies
            </NavLink>

            <NavLink to="/conflicts" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Conflicts
            </NavLink>
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: 'var(--spacing-lg)', borderTop: '1px solid var(--color-border)' }}>
            <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                HubSpot Sync Tool v1.0
            </div>
        </div>
    </aside>
);

function App() {
    useEffect(() => {
        // Connect WebSocket
        socketService.connect();

        // Listen for real-time updates
        socketService.on('sync:completed', (data) => {
            console.log('Sync completed:', data);
        });

        socketService.on('sync:error', (data) => {
            console.error('Sync error:', data);
        });

        socketService.on('conflict:new', (data) => {
            console.log('New conflict:', data);
        });

        return () => {
            socketService.disconnect();
        };
    }, []);

    return (
        <BrowserRouter>
            <ToastProvider>
                <div className="app-container">
                    <Sidebar />
                    <main className="main-content content-with-sidebar">
                        <Routes>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="/contacts" element={<ContactsList />} />
                            <Route path="/companies" element={<CompaniesList />} />
                            <Route path="/conflicts" element={<ConflictsList />} />
                        </Routes>
                    </main>
                </div>
            </ToastProvider>
        </BrowserRouter>
    );
}

export default App;
