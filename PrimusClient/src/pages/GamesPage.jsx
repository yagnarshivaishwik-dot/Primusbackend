import { useState, useEffect } from 'react';
import { Search, Monitor, Gamepad, Crosshair, Sword, Users, Zap, ChevronRight, HardDrive, Plus, FolderOpen, Trash2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/dialog';
import GameCard from '../components/GameCard';
import { apiService } from '../services/apiClient';
import { showToast } from '../utils/api';

const tags = ['All', 'Multiplayer', 'FPS', 'Shooter', 'Battle Royale', 'MOBA', 'Action', 'Strategy', 'Casual', 'RPG'];

const launchers = [
    { name: 'Steam', icon: '🎮', color: 'linear-gradient(135deg, #1b2838 0%, #2a475e 100%)' },
    { name: 'Epic Games', icon: '🎲', color: '#2a2a2a' },
    { name: 'Battle.net', icon: '⚔️', color: 'linear-gradient(135deg, #00aeff 0%, #0074d9 100%)' },
    { name: 'Ubisoft', icon: '🎯', color: '#0070d1' },
];

const LOCAL_GAMES_KEY = 'primus_local_games';

const GamesPage = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTag, setSelectedTag] = useState('All');
    const [freeToPlay, setFreeToPlay] = useState(false);
    const [availableToBorrow, setAvailableToBorrow] = useState(false);
    const [autoScanEnabled, setAutoScanEnabled] = useState(false);
    const [installedPaths, setInstalledPaths] = useState([]);

    // Data states
    const [games, setGames] = useState([]);
    const [localGames, setLocalGames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Add game modal
    const [showAddGame, setShowAddGame] = useState(false);
    const [newGameName, setNewGameName] = useState('');
    const [newGamePath, setNewGamePath] = useState('');

    // Load local games from localStorage
    useEffect(() => {
        try {
            const stored = localStorage.getItem(LOCAL_GAMES_KEY);
            if (stored) {
                setLocalGames(JSON.parse(stored));
            }
        } catch (e) {
            console.error('Failed to load local games:', e);
        }
    }, []);

    // Save local games to localStorage
    const saveLocalGames = (games) => {
        setLocalGames(games);
        localStorage.setItem(LOCAL_GAMES_KEY, JSON.stringify(games));
    };

    // Initial Fetch
    useEffect(() => {
        fetchGames();
    }, []);

    // Search Effect (Debounced)
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery.trim()) {
                handleSearch(searchQuery);
            } else {
                fetchGames(); // Reset to full list if search cleared
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Auto Scan Logic
    useEffect(() => {
        const runAutoScan = async () => {
            if (!autoScanEnabled) {
                setInstalledPaths([]);
                return;
            }

            const allGames = [...games, ...localGames];
            if (allGames.length === 0) return;

            try {
                // Collect all exe_paths from loaded games
                const pathsToCheck = allGames
                    .map(g => g.exe_path)
                    .filter(p => p && p.trim().length > 0);

                if (pathsToCheck.length === 0) return;

                // Call custom Tauri command
                const verifiedPaths = await invoke('check_installed_paths', { paths: pathsToCheck });
                setInstalledPaths(verifiedPaths);
            } catch (err) {
                console.error("Auto scan failed:", err);
            }
        };

        runAutoScan();
    }, [autoScanEnabled, games, localGames]);


    const fetchGames = async () => {
        try {
            setLoading(true);
            const res = await apiService.games.list();
            const data = Array.isArray(res.data) ? res.data : (res.data?.games || []);
            setGames(data);
            setError(null);
        } catch (err) {
            console.error("Failed to fetch games:", err);
            setError("Failed to load games from server. You can still add local games.");
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async (q) => {
        try {
            setLoading(true);
            const res = await apiService.games.search(q);
            const data = Array.isArray(res.data) ? res.data : (res.data?.games || []);
            setGames(data);
        } catch (err) {
            console.error("Search failed:", err);
        } finally {
            setLoading(false);
        }
    };

    // Add local game
    const handleAddGame = () => {
        if (!newGameName.trim() || !newGamePath.trim()) {
            showToast('Please enter both name and path');
            return;
        }

        const newGame = {
            id: `local_${Date.now()}`,
            name: newGameName,
            title: newGameName,
            exe_path: newGamePath,
            is_local: true,
            genre: 'Local Game',
            tags: ['Local']
        };

        saveLocalGames([...localGames, newGame]);
        setNewGameName('');
        setNewGamePath('');
        setShowAddGame(false);
        showToast(`Added "${newGameName}" to local games`);
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
                setNewGamePath(selected);
            }
        } catch (e) {
            console.error('Failed to open file dialog:', e);
        }
    };

    // Remove local game
    const handleRemoveLocalGame = (gameId) => {
        const updated = localGames.filter(g => g.id !== gameId);
        saveLocalGames(updated);
        showToast('Game removed');
    };

    // Launch local game
    const handleLaunchGame = async (game) => {
        if (game.exe_path) {
            try {
                // await invoke('launch_game', { path: game.exe_path }); // OLD ERROR
                const res = await invoke('launch_game', { exePath: game.exe_path });
                showToast(`Launching ${game.title || game.name}...`);
                console.log(res);
            } catch (e) {
                console.error('Failed to launch game:', e);
                // SHOW ERROR TO USER - Critical for debugging
                // "debugger did not work" likely means they didn't see logs.
                alert(`Expected Launch Failure:\n${e}\n\nPath: ${game.exe_path}`);
                showToast(`Launch Failed: ${e}`);
            }
        }
    };

    // Auto-detect games on mount
    useEffect(() => {
        const detectGames = async () => {
            // Only auto-detect if list is empty or explicitly requested, but user said "auto add"
            try {
                const detected = await invoke('detect_installed_games');
                if (detected && detected.length > 0) {
                    // Check for duplicates against localGames
                    const newGames = detected.filter(d =>
                        !localGames.some(l => l.exe_path === d.exe_path)
                    );

                    if (newGames.length > 0) {
                        const formatted = newGames.map((g, i) => ({
                            id: `auto_${Date.now()}_${i}`,
                            name: g.name,
                            title: g.name,
                            exe_path: g.exe_path,
                            image: 'https://picsum.photos/400/600', // Placeholder
                            genre: 'Detected',
                            is_local: true,
                            badge: 'INSTALLED'
                        }));

                        saveLocalGames([...localGames, ...formatted]);
                        showToast(`Found ${newGames.length} installed games!`);
                    }
                }
            } catch (e) {
                console.error("Auto detection failed", e);
            }
        };

        detectGames();
    }, []); // Run ONCE on mount

    // Combine API games with local games
    const allGames = [...games, ...localGames];

    // Client-side filtering
    const filteredGames = allGames.filter(game => {
        // Tag filter
        const gameTags = game.tags || (game.genre ? [game.genre] : []);
        const matchesTag = selectedTag === 'All' || gameTags.includes(selectedTag) || game.genre === selectedTag;

        // License filters
        const matchesF2P = !freeToPlay || game.is_free;
        const matchesBorrow = !availableToBorrow || game.can_borrow;

        // Auto Scan Filter (Only Installed)
        const matchesInstalled = !autoScanEnabled || (game.exe_path && installedPaths.includes(game.exe_path));

        return matchesTag && matchesF2P && matchesBorrow && matchesInstalled;
    });

    const mapGame = (g) => ({
        id: g.id,
        title: g.title || g.name,
        image: g.image || g.cover_url || g.icon_url || 'https://picsum.photos/400/600',
        genre: g.genre || 'Game',
        badge: g.is_popular ? 'Popular' : undefined,
        tags: g.tags || []
    });

    return (
        <div className="page-content">
            <div className="games-page">
                {/* Sidebar Filters */}
                <aside className="games-sidebar">
                    {/* Add Game Button */}
                    <div className="filter-section" style={{
                        background: 'rgba(58, 190, 255, 0.05)',
                        border: '1px solid rgba(58, 190, 255, 0.2)'
                    }}>
                        <button
                            className="btn btn-primary"
                            style={{ width: '100%' }}
                            onClick={() => setShowAddGame(true)}
                        >
                            <Plus size={18} />
                            Add Local Game
                        </button>
                    </div>

                    {/* Local Games List */}
                    {localGames.length > 0 && (
                        <div className="filter-section">
                            <h3 className="filter-section__title">Local Games ({localGames.length})</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                                {localGames.map(game => (
                                    <div key={game.id} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: 'var(--spacing-sm)',
                                        background: 'rgba(255,255,255,0.03)',
                                        borderRadius: 'var(--radius-sm)',
                                        fontSize: '0.875rem'
                                    }}>
                                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {game.name}
                                        </span>
                                        <button
                                            onClick={() => handleRemoveLocalGame(game.id)}
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

                    {/* Auto Scan Toggle */}
                    <div className="filter-section" style={{
                        background: 'rgba(50, 255, 100, 0.05)',
                        border: '1px solid rgba(50, 255, 100, 0.2)'
                    }}>
                        <h3 className="filter-section__title" style={{ color: 'var(--success)' }}>
                            <HardDrive size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: 'text-bottom' }} />
                            Installed Only
                        </h3>
                        <div className="filter-toggle">
                            <span className="filter-toggle__label">Auto Scan System</span>
                            <button
                                className={`toggle ${autoScanEnabled ? 'active' : ''}`}
                                onClick={() => setAutoScanEnabled(!autoScanEnabled)}
                            />
                        </div>
                        {autoScanEnabled && (
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                Showing {filteredGames.length} installed games found.
                            </p>
                        )}
                    </div>

                    {/* License Filters */}
                    <div className="filter-section">
                        <h3 className="filter-section__title">License</h3>
                        <div className="filter-toggle">
                            <span className="filter-toggle__label">Available to borrow</span>
                            <button
                                className={`toggle ${availableToBorrow ? 'active' : ''}`}
                                onClick={() => setAvailableToBorrow(!availableToBorrow)}
                            />
                        </div>
                        <div className="filter-toggle">
                            <span className="filter-toggle__label">Free to play</span>
                            <button
                                className={`toggle ${freeToPlay ? 'active' : ''}`}
                                onClick={() => setFreeToPlay(!freeToPlay)}
                            />
                        </div>
                    </div>

                    {/* Tags */}
                    <div className="filter-section">
                        <h3 className="filter-section__title">Browse by Tag</h3>
                        <div className="tags">
                            {tags.map((tag) => (
                                <button
                                    key={tag}
                                    className={`tag ${selectedTag === tag ? 'active' : ''}`}
                                    onClick={() => setSelectedTag(tag)}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="games-main">
                    {/* Page Header */}
                    <div style={{ marginBottom: 'var(--spacing-xl)' }}>
                        <h1 className="heading-2" style={{ marginBottom: 'var(--spacing-sm)' }}>
                            Discover <span className="text-gradient">{filteredGames.length} games</span> available
                        </h1>
                    </div>

                    {/* Search Bar */}
                    <div className="search-bar">
                        <Search size={20} className="search-bar__icon" />
                        <input
                            type="text"
                            className="search-bar__input"
                            placeholder="Search games..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Launchers - Hide if scanning for installed games to reduce clutter, or keep it? Keeping it. */}
                    <section className="section">
                        <div className="section__header">
                            <h2 className="section__title">Access your own games</h2>
                            <a href="#" className="section__link">
                                Explore all launchers
                                <ChevronRight size={18} />
                            </a>
                        </div>
                        <div className="launchers">
                            {launchers.map((launcher) => (
                                <div key={launcher.name} className="launcher-card">
                                    <div className="launcher-card__icon" style={{ background: launcher.color }}>
                                        {launcher.icon}
                                    </div>
                                    <span className="launcher-card__name">{launcher.name}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    {loading ? (
                        <div className="center-content" style={{ padding: '4rem' }}>
                            <div className="loading-spinner" />
                        </div>
                    ) : error ? (
                        <div className="error-state">
                            <p>{error}</p>
                            <button className="btn btn-secondary" onClick={fetchGames}>Retry</button>
                        </div>
                    ) : (
                        <>
                            {/* Most Played (Top 6) */}
                            {filteredGames.length > 0 && (
                                <section className="section">
                                    <div className="section__header">
                                        <h2 className="section__title">Most played games</h2>
                                    </div>
                                    <div className="games-row">
                                        {filteredGames.slice(0, 6).map((game, index) => (
                                            <GameCard
                                                key={game.id}
                                                game={mapGame(game)}
                                                ranking={index + 1}
                                                onClick={() => handleLaunchGame(game)}
                                            />
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* All Games Grid */}
                            <section className="section">
                                <div className="section__header">
                                    <h2 className="section__title">All Games</h2>
                                </div>
                                {filteredGames.length > 0 ? (
                                    <div className="games-grid" style={{
                                        maxHeight: 'calc(100vh - 350px)',
                                        overflowY: 'auto',
                                        paddingRight: '10px'
                                    }}>
                                        {filteredGames.map((game) => (
                                            <GameCard
                                                key={game.id}
                                                game={mapGame(game)}
                                                hideImage={game.is_local}
                                                onClick={() => handleLaunchGame(game)}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="empty-state">
                                        <p>No games found matching your criteria.</p>
                                        {autoScanEnabled && <p>Try disabling "Auto Scan" to see all available library games.</p>}
                                    </div>
                                )}
                            </section>
                        </>
                    )}
                </main>
            </div>

            {/* Add Game Modal */}
            {showAddGame && (
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
                        <h2 className="auth-title">Add Local Game</h2>
                        <p className="auth-subtitle">Add a game from your computer</p>

                        <div className="auth-form">
                            <div className="auth-input-group">
                                <Gamepad size={18} className="auth-input-icon" />
                                <input
                                    type="text"
                                    placeholder="Game Name"
                                    value={newGameName}
                                    onChange={(e) => setNewGameName(e.target.value)}
                                />
                            </div>

                            <div className="auth-input-group" style={{ position: 'relative' }}>
                                <FolderOpen size={18} className="auth-input-icon" />
                                <input
                                    type="text"
                                    placeholder="Executable Path (e.g., C:\Games\game.exe)"
                                    value={newGamePath}
                                    onChange={(e) => setNewGamePath(e.target.value)}
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
                                        setShowAddGame(false);
                                        setNewGameName('');
                                        setNewGamePath('');
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="btn btn-primary"
                                    style={{ flex: 1 }}
                                    onClick={handleAddGame}
                                >
                                    Add Game
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GamesPage;
