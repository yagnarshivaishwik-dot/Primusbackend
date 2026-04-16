import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { getApiBase, authHeaders } from './utils/api';
import { invoke } from './utils/invoke';

// --- Helper Components for Icons ---
const SearchIcon = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
);

const GameCard = ({ game, userAge }) => {
    const isAgeRestricted = userAge != null && game.min_age != null && userAge < game.min_age;
    return (
        <div
            className={`glass-card overflow-hidden group transition-all duration-300 hover:scale-[1.02] h-full flex flex-col ${isAgeRestricted ? 'opacity-60 cursor-not-allowed' : ''
                }`}
            title={isAgeRestricted ? `Age restricted: ${game.min_age}+` : ''}
        >
            <div className="relative w-full aspect-[16/9]">
                <img src={game.cover} alt={game.name} className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            </div>
            <div className="p-4 mt-auto">
                <div className="flex items-center justify-between gap-2">
                    <h3 className="text-white font-bold text-lg truncate">{game.name}</h3>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 border border-white/20 text-gray-200">{game.is_free ? 'Free' : 'Requires account'}</span>
                        {typeof game.min_age === 'number' && game.min_age > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-red-700/80 text-white">{game.min_age}+</span>
                        )}
                    </div>
                </div>
                {isAgeRestricted && <div className="text-xs text-red-400 mt-1">Age restricted</div>}
            </div>
        </div>
    );
};

const Sidebar = ({ selectedTag, onSelectTag, freeOnly, setFreeOnly, requiresAccountOnly, setRequiresAccountOnly, hideRestricted, setHideRestricted }) => {
    const tags = ["Action", "Battle Royale", "Casual", "Coop", "FPS", "Multiplayer", "RPG", "Shooter", "Strategy"];
    const ordered = ["All", ...tags.sort((a, b) => a.localeCompare(b))];
    return (
        <aside className="w-64 flex-shrink-0 p-6 space-y-8">
            <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-3">ACCESS</h3>
                <div className="flex flex-col gap-2 text-white">
                    <button className={`glass-item w-full text-left ${freeOnly ? 'ring-1 ring-primary/60' : ''}`} onClick={() => setFreeOnly(!freeOnly)}>Free to play</button>
                    <button className={`glass-item w-full text-left ${requiresAccountOnly ? 'ring-1 ring-primary/60' : ''}`} onClick={() => setRequiresAccountOnly(!requiresAccountOnly)}>Requires your account</button>
                    <button className={`glass-item w-full text-left ${hideRestricted ? 'ring-1 ring-primary/60' : ''}`} onClick={() => setHideRestricted(!hideRestricted)}>Hide age-restricted</button>
                </div>
            </div>
            <div className="glass-card p-3">
                <h3 className="text-sm font-semibold text-gray-400 mb-3">BROWSE BY TAG</h3>
                <ul className="space-y-2 text-white">
                    {ordered.map(tag => (
                        <li key={tag}>
                            <button
                                className={`w-full text-left glass-item ${selectedTag === tag ? 'ring-1 ring-primary/60' : ''}`}
                                onClick={() => onSelectTag(tag)}
                            >
                                {tag}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </aside>
    );
};

// Initial placeholder list; will be replaced by backend games
const ALL_GAMES = [];

export default function Games({ currentUser }) {
    const [selectedTag, setSelectedTag] = useState("All");
    const [searchTerm, setSearchTerm] = useState("");
    const [games, setGames] = useState(ALL_GAMES);
    const [detectedGames, setDetectedGames] = useState([]);
    const [loading, setLoading] = useState(false);
    const [freeOnly, setFreeOnly] = useState(false);
    const [requiresAccountOnly, setRequiresAccountOnly] = useState(false);
    const [hideRestricted, setHideRestricted] = useState(true);
    const [userAge, setUserAge] = useState(null);
    const [showAddGame, setShowAddGame] = useState(false);
    const [newGameName, setNewGameName] = useState('');
    const [newGamePath, setNewGamePath] = useState('');

    useEffect(() => {
        if (currentUser?.birthdate) {
            const bd = new Date(currentUser.birthdate);
            const today = new Date();
            let age = today.getFullYear() - bd.getFullYear();
            const m = today.getMonth() - bd.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
            setUserAge(age);
        } else {
            setUserAge(null);
        }

        // Load detected games
        loadDetectedGames();
    }, [currentUser]);

    const loadDetectedGames = async () => {
        try {
            // Load auto-detected games
            const detected = await invoke('detect_installed_games');

            // Load manually added games from localStorage
            const savedGames = JSON.parse(localStorage.getItem('primus_manual_games') || '[]');

            // Combine both lists
            const allGames = [...(detected || []), ...savedGames];
            setDetectedGames(allGames);
        } catch (error) {
            console.warn('Failed to detect games:', error);
        }
    };

    const browseForGame = async () => {
        try {
            // Temporarily allow dialogs to appear
            await invoke('temporarily_allow_dialogs');

            // Open file browser
            const selectedPath = await invoke('browse_for_game');
            setNewGamePath(selectedPath);

            // Auto-fill game name from filename
            const fileName = selectedPath.split('\\').pop().replace('.exe', '');
            if (!newGameName.trim()) {
                setNewGameName(fileName);
            }

            console.log('Game selected:', fileName, 'at', selectedPath);
        } catch (error) {
            if (error !== 'No file selected') {
                console.error('Browse error:', error);
                alert(`Failed to browse for game: ${error}`);
            }
        }
    };

    const addManualGame = async () => {
        if (!newGameName.trim() || !newGamePath.trim()) {
            alert('Please enter both game name and path');
            return;
        }

        try {
            await invoke('add_manual_game', { name: newGameName, exePath: newGamePath });

            // Add to local list and save to localStorage
            const newGame = {
                name: newGameName,
                exe_path: newGamePath,
                install_path: newGamePath,
                is_running: false
            };

            const updatedGames = [...detectedGames, newGame];
            setDetectedGames(updatedGames);

            // Save to localStorage for persistence
            localStorage.setItem('primus_manual_games', JSON.stringify(updatedGames));

            // Reset form
            setNewGameName('');
            setNewGamePath('');
            setShowAddGame(false);

            alert(`Game '${newGameName}' added successfully!`);
        } catch (error) {
            alert(`Failed to add game: ${error}`);
        }
    };

    const launchDetectedGame = async (game) => {
        try {
            console.log('Launching game:', game.name, 'from', game.exe_path);
            await invoke('launch_game', { exePath: game.exe_path });
            console.log(`✅ ${game.name} launched successfully`);

            // Show success message
            setTimeout(() => {
                alert(`🎮 ${game.name} is starting...`);
            }, 500);
        } catch (error) {
            console.error('Launch error:', error);
            alert(`❌ Failed to launch ${game.name}: ${error}`);
        }
    };

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
                const base = getApiBase();
                const res = await axios.get(`${base}/api/game/`, { headers: authHeaders() });
                if (Array.isArray(res.data)) {
                    const mapped = res.data.map(g => ({ id: g.id, name: g.name, cover: g.icon_url || 'https://via.placeholder.com/400x200/1f2937/ffffff?text=' + g.name, tags: ["Action"], is_free: g.is_free, min_age: g.min_age }));
                    setGames(mapped);
                }
            } catch (_) { }
            setLoading(false);
        };
        load();
    }, []);

    const filteredGames = games.filter(game => {
        const tagMatch = selectedTag === "All" || game.tags.includes(selectedTag);
        const searchMatch = game.name.toLowerCase().includes(searchTerm.toLowerCase());
        const freeMatch = !freeOnly || game.is_free === true;
        const paidMatch = !requiresAccountOnly || game.is_free === false;
        const ageOk = !hideRestricted || userAge == null || game.min_age == null || userAge >= game.min_age;
        return tagMatch && searchMatch && freeMatch && paidMatch && ageOk;
    });

    return (
        <div className="flex-1 flex text-white overflow-hidden">
            {/* Main Content */}
            <div className="flex-1 flex h-full">
                <Sidebar selectedTag={selectedTag} onSelectTag={setSelectedTag} freeOnly={freeOnly} setFreeOnly={setFreeOnly} requiresAccountOnly={requiresAccountOnly} setRequiresAccountOnly={setRequiresAccountOnly} hideRestricted={hideRestricted} setHideRestricted={setHideRestricted} />
                <main className="flex-1 p-8 overflow-hidden flex flex-col">
                    <div className="relative mb-8 glass-card p-3">
                        <input
                            type="text"
                            placeholder="Search game"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full glass-input outline-none py-2 pl-10 pr-2"
                        />
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    </div>

                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-2xl font-bold text-white">All games</h2>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setShowAddGame(!showAddGame)}
                                className="glass-item px-4 py-2 text-sm bg-primary/20 hover:bg-primary/40"
                            >
                                ➕ Add Game
                            </button>
                            <button
                                onClick={loadDetectedGames}
                                className="glass-item px-4 py-2 text-sm bg-blue-500/20 hover:bg-blue-500/40"
                            >
                                🔍 Scan
                            </button>
                            <div className="text-sm text-gray-400">
                                Sort by: <button className="text-white font-semibold">Alphabetically</button>
                            </div>
                        </div>
                    </div>

                    {/* Add Game Form */}
                    {showAddGame && (
                        <div className="glass-card p-6 mb-6 border border-primary/30">
                            <h3 className="text-white font-bold text-lg mb-4">🎮 Add Game Manually</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="block text-gray-300 text-sm mb-2">Game Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g., Counter-Strike 2"
                                        value={newGameName}
                                        onChange={(e) => setNewGameName(e.target.value)}
                                        className="glass-input w-full"
                                    />
                                </div>
                                <div>
                                    <label className="block text-gray-300 text-sm mb-2">Executable Path</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="e.g., C:\\Games\\CS2\\cs2.exe"
                                            value={newGamePath}
                                            onChange={(e) => setNewGamePath(e.target.value)}
                                            className="glass-input flex-1"
                                        />
                                        <button
                                            type="button"
                                            onClick={browseForGame}
                                            className="bg-blue-500/80 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm"
                                        >
                                            📁 Browse
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={addManualGame}
                                    disabled={!newGameName.trim() || !newGamePath.trim()}
                                    className="bg-primary/80 hover:bg-primary text-white px-6 py-2 rounded disabled:bg-gray-600 disabled:cursor-not-allowed"
                                >
                                    ✅ Add Game
                                </button>
                                <button
                                    onClick={() => setShowAddGame(false)}
                                    className="bg-gray-600/80 hover:bg-gray-600 text-white px-6 py-2 rounded"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Detected Games Section */}
                    {detectedGames.length > 0 && (
                        <div className="mb-6">
                            <h3 className="text-xl font-bold text-white mb-4">🖥️ Installed Games ({detectedGames.length})</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
                                {detectedGames.map((game, index) => (
                                    <div
                                        key={index}
                                        className="glass-card p-4 hover:scale-105 transition-transform cursor-pointer"
                                        onClick={() => launchDetectedGame(game)}
                                    >
                                        <div className="text-center">
                                            <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center mx-auto mb-3 text-2xl">
                                                🎮
                                            </div>
                                            <h4 className="text-white font-semibold mb-2 truncate" title={game.name}>{game.name}</h4>
                                            <p className="text-gray-400 text-xs mb-3 truncate" title={game.install_path}>{game.install_path}</p>
                                            <div className="bg-primary/80 hover:bg-primary text-white px-3 py-2 rounded text-sm font-medium">
                                                🚀 Launch
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto pr-2 -mr-2" style={{ maxHeight: 'calc(100vh - 300px)' }}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                            {loading ? (
                                <>
                                    {[...Array(8)].map((_, i) => (
                                        <div key={i} className="glass-card h-56 animate-pulse" />
                                    ))}
                                </>
                            ) : filteredGames.length > 0 ? (
                                filteredGames.map(game => <GameCard key={game.id} game={game} userAge={userAge} />)
                            ) : (
                                <p className="col-span-full text-center text-gray-400">No games found for "{selectedTag}".</p>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
