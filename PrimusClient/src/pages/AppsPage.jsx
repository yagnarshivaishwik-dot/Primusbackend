import { useState, useEffect } from 'react';
import { Search, Plus, FolderOpen, Trash2, AppWindow } from 'lucide-react';
import { open } from '@tauri-apps/api/dialog';
import { invoke } from '@tauri-apps/api/tauri';
import GameCard from '../components/GameCard';
import { apiService } from '../services/apiClient';
import { showToast } from '../utils/api';

const categories = ['All', 'Communication', 'Music', 'Streaming', 'Browser', 'Gaming', 'Media', 'Development', 'Utility'];

// Keywords to identify "Apps" vs "Games" if backend doesn't separate them strictly yet
const APP_KEYWORDS = ['app', 'application', 'browser', 'utility', 'media', 'music', 'discord', 'spotify', 'chrome', 'obs', 'vlc', 'code'];

const LOCAL_APPS_KEY = 'primus_local_apps';

const AppsPage = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');

    const [apps, setApps] = useState([]);
    const [localApps, setLocalApps] = useState([]);
    const [loading, setLoading] = useState(true);

    // Add app modal
    const [showAddApp, setShowAddApp] = useState(false);
    const [newAppName, setNewAppName] = useState('');
    const [newAppPath, setNewAppPath] = useState('');

    // Load local apps from localStorage
    useEffect(() => {
        try {
            const stored = localStorage.getItem(LOCAL_APPS_KEY);
            if (stored) {
                setLocalApps(JSON.parse(stored));
            }
        } catch (e) {
            console.error('Failed to load local apps:', e);
        }
    }, []);

    // Save local apps to localStorage
    const saveLocalApps = (apps) => {
        setLocalApps(apps);
        localStorage.setItem(LOCAL_APPS_KEY, JSON.stringify(apps));
    };

    useEffect(() => {
        fetchApps();
    }, []);

    const fetchApps = async () => {
        try {
            setLoading(true);
            const res = await apiService.games.list();
            const allItems = Array.isArray(res.data) ? res.data : (res.data?.games || []);

            // Client-side filtering to distinguish Apps from Games
            const appItems = allItems.filter(item => {
                const genre = (item.genre || '').toLowerCase();
                const tags = (item.tags || []).map(t => t.toLowerCase());
                const title = (item.title || item.name || '').toLowerCase();

                const isApp = APP_KEYWORDS.some(k =>
                    genre.includes(k) || tags.includes(k) || title.includes(k)
                );

                return isApp || genre === 'software';
            });

            setApps(appItems);
        } catch (err) {
            console.error("Failed to fetch apps:", err);
        } finally {
            setLoading(false);
        }
    };

    // Add local app
    const handleAddApp = () => {
        if (!newAppName.trim() || !newAppPath.trim()) {
            showToast('Please enter both name and path');
            return;
        }

        const newApp = {
            id: `local_app_${Date.now()}`,
            name: newAppName,
            title: newAppName,
            exe_path: newAppPath,
            is_local: true,
            genre: 'Local App',
            tags: ['Local']
        };

        saveLocalApps([...localApps, newApp]);
        setNewAppName('');
        setNewAppPath('');
        setShowAddApp(false);
        showToast(`Added "${newAppName}" to local apps`);
    };

    // Browse for executable
    const handleBrowsePath = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Executable',
                    extensions: ['exe', 'bat', 'cmd', 'lnk']
                }]
            });
            if (selected && typeof selected === 'string') {
                setNewAppPath(selected);
            }
        } catch (e) {
            console.error('Failed to open file dialog:', e);
        }
    };

    // Remove local app
    const handleRemoveLocalApp = (appId) => {
        const updated = localApps.filter(a => a.id !== appId);
        saveLocalApps(updated);
        showToast('App removed');
    };

    // Combine API apps with local apps
    const allApps = [...apps, ...localApps];

    const filteredApps = allApps.filter(app => {
        const matchesSearch = (app.title || app.name).toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = selectedCategory === 'All' || (app.genre === selectedCategory);
        return matchesSearch && matchesCategory;
    });

    const mapApp = (a) => ({
        id: a.id,
        title: a.title || a.name,
        image: a.image || a.cover_url || a.icon_url || 'https://picsum.photos/400/600',
        genre: a.genre || 'App'
    });

    // Launch app
    const handleLaunchApp = async (app) => {
        if (app.exe_path) {
            try {
                await invoke('launch_game', { exePath: app.exe_path });
                showToast(`Launching ${app.title || app.name}...`);
            } catch (e) {
                console.error('Failed to launch app:', e);
                // SHOW ERROR TO USER
                alert(`App Launch Failed:\n${e}\n\nPath: ${app.exe_path}`);
                showToast('Failed to launch app');
            }
        }
    };

    // Auto-detect apps on mount
    useEffect(() => {
        const detectApps = async () => {
            try {
                const detected = await invoke('detect_installed_apps');
                if (detected && detected.length > 0) {
                    // Check for duplicates
                    const newApps = detected.filter(d =>
                        !localApps.some(l => l.exe_path === d.exe_path)
                    );

                    if (newApps.length > 0) {
                        const formatted = newApps.map((a, i) => ({
                            id: `auto_app_${Date.now()}_${i}`,
                            name: a.name,
                            title: a.name,
                            exe_path: a.exe_path,
                            image: '', // Use default placeholder
                            genre: 'Application',
                            is_local: true,
                            badge: 'INSTALLED'
                        }));

                        saveLocalApps([...localApps, ...formatted]);
                        showToast(`Found ${newApps.length} installed apps!`);
                    }
                }
            } catch (e) {
                console.error("Auto app detection failed", e);
            }
        };

        detectApps();
    }, []);

    return (
        <div className="page-content">
            <div className="games-page">
                {/* Sidebar */}
                <aside className="games-sidebar">
                    {/* Add App Button */}
                    <div className="filter-section" style={{
                        background: 'rgba(58, 190, 255, 0.05)',
                        border: '1px solid rgba(58, 190, 255, 0.2)'
                    }}>
                        <button
                            className="btn btn-primary"
                            style={{ width: '100%' }}
                            onClick={() => setShowAddApp(true)}
                        >
                            <Plus size={18} />
                            Add Local App
                        </button>
                    </div>

                    {/* Local Apps List */}
                    {localApps.length > 0 && (
                        <div className="filter-section">
                            <h3 className="filter-section__title">Local Apps ({localApps.length})</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                                {localApps.map(app => (
                                    <div key={app.id} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: 'var(--spacing-sm)',
                                        background: 'rgba(255,255,255,0.03)',
                                        borderRadius: 'var(--radius-sm)',
                                        fontSize: '0.875rem'
                                    }}>
                                        <span
                                            style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                                            onClick={() => handleLaunchApp(app)}
                                        >
                                            {app.name}
                                        </span>
                                        <button
                                            onClick={() => handleRemoveLocalApp(app.id)}
                                            style={{ color: 'var(--error)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                                            title="Remove"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="filter-section">
                        <h3 className="filter-section__title">Categories</h3>
                        <div className="tags" style={{ flexDirection: 'column' }}>
                            {categories.map((cat) => (
                                <button
                                    key={cat}
                                    className={`tag ${selectedCategory === cat ? 'active' : ''}`}
                                    onClick={() => setSelectedCategory(cat)}
                                    style={{ justifyContent: 'flex-start' }}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>
                </aside>

                {/* Main */}
                <main className="games-main">
                    <div style={{ marginBottom: 'var(--spacing-xl)' }}>
                        <h1 className="heading-2">
                            <span className="text-gradient">{filteredApps.length} Apps</span> Available
                        </h1>
                    </div>

                    <div className="search-bar">
                        <Search size={20} className="search-bar__icon" />
                        <input
                            type="text"
                            className="search-bar__input"
                            placeholder="Search apps..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <section className="section">
                        {loading ? (
                            <div className="center-content">
                                <div className="loading-spinner" />
                            </div>
                        ) : filteredApps.length > 0 ? (
                            <div className="games-grid" style={{
                                maxHeight: 'calc(100vh - 200px)',
                                overflowY: 'auto',
                                paddingRight: '10px'
                            }}>
                                {filteredApps.map((app) => (
                                    <GameCard
                                        key={app.id}
                                        game={mapApp(app)}
                                        hideImage={app.is_local} // Hide image for local apps
                                        onClick={() => handleLaunchApp(app)}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="empty-state">
                                <p>No applications found.</p>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                                    Try adding an app using the "Add Local App" button.
                                </p>
                            </div>
                        )}
                    </section>
                </main>
            </div>

            {/* Add App Modal */}
            {showAddApp && (
                <div className="modal-overlay" style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div className="auth-card" style={{ maxWidth: 450 }}>
                        <h2 className="auth-title">Add Local App</h2>
                        <p className="auth-subtitle">Add an application from your computer</p>

                        <div className="auth-form">
                            <div className="auth-input-group">
                                <AppWindow size={18} className="auth-input-icon" />
                                <input
                                    type="text"
                                    placeholder="App Name"
                                    value={newAppName}
                                    onChange={(e) => setNewAppName(e.target.value)}
                                />
                            </div>

                            <div className="auth-input-group" style={{ position: 'relative' }}>
                                <FolderOpen size={18} className="auth-input-icon" />
                                <input
                                    type="text"
                                    placeholder="Executable Path (e.g., C:\Program Files\app.exe)"
                                    value={newAppPath}
                                    onChange={(e) => setNewAppPath(e.target.value)}
                                    style={{ paddingRight: 80 }}
                                />
                                <button
                                    type="button"
                                    onClick={handleBrowsePath}
                                    style={{
                                        position: 'absolute',
                                        right: 8,
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        padding: '6px 12px',
                                        background: 'var(--accent-gradient)',
                                        border: 'none',
                                        borderRadius: 'var(--radius-sm)',
                                        color: 'var(--bg-primary)',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Browse
                                </button>
                            </div>

                            <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-md)' }}>
                                <button
                                    className="btn btn-secondary"
                                    style={{ flex: 1 }}
                                    onClick={() => {
                                        setShowAddApp(false);
                                        setNewAppName('');
                                        setNewAppPath('');
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="btn btn-primary"
                                    style={{ flex: 1 }}
                                    onClick={handleAddApp}
                                >
                                    Add App
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AppsPage;
