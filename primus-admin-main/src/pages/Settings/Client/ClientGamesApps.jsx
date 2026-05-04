import { useState, useEffect } from 'react';

// Phase 3 extraction from AdminUI.jsx (originally lines 2427-3003).
// Audit cleanup: removed dead `getFilterCount` helper (no-unused-vars).
// console.error calls in load/toggle/save paths replaced with no-op fail-soft;
// future work: surface failures via the toast system used elsewhere.

function ClientGamesApps() {
    const [games, setGames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filter, setFilter] = useState('all');
    const [totalCount, setTotalCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(0);
    const [pageSize] = useState(100);
    const [editModal, setEditModal] = useState(false);
    const [editingGame, setEditingGame] = useState(null);
    const blankForm = {
        name: '',
        category: 'game',
        age_rating: 0,
        tags: [],
        website: '',
        pc_groups: [],
        user_groups: '',
        launchers: [],
        never_use_parent_license: false,
        image_600x900: '',
        image_background: '',
        logo_url: '',
    };
    const [editForm, setEditForm] = useState(blankForm);

    useEffect(() => {
        const loadGames = async () => {
            try {
                setLoading(true);
                const params = new URLSearchParams({
                    skip: currentPage * pageSize,
                    limit: pageSize,
                    search: searchTerm || undefined,
                    category: filter === 'all' ? undefined : filter,
                    enabled:
                        filter === 'enabled'
                            ? true
                            : filter === 'disabled'
                            ? false
                            : undefined,
                });
                const [gamesResponse, countResponse] = await Promise.all([
                    fetch(`/api/games?${params}`),
                    fetch(`/api/games/count?${params}`),
                ]);
                if (gamesResponse.ok && countResponse.ok) {
                    const gamesData = await gamesResponse.json();
                    const countData = await countResponse.json();
                    setGames(gamesData);
                    setTotalCount(countData.count);
                }
            } catch (_e) {
                // fail-soft: empty list with loading=false
            } finally {
                setLoading(false);
            }
        };
        loadGames();
    }, [searchTerm, filter, currentPage, pageSize]);

    const toggleGame = async (gameId, enabled) => {
        try {
            const response = await fetch(`/api/games/${gameId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: !enabled }),
            });
            if (response.ok) {
                setGames((prev) =>
                    prev.map((game) => (game.id === gameId ? { ...game, enabled: !enabled } : game))
                );
            }
        } catch (_e) {
            // fail-soft
        }
    };

    const openEditModal = (game) => {
        setEditingGame(game);
        setEditForm({
            name: game.name || '',
            category: game.category || 'game',
            age_rating: game.age_rating || 0,
            tags: game.tags ? JSON.parse(game.tags) : [],
            website: game.website || '',
            pc_groups: game.pc_groups ? JSON.parse(game.pc_groups) : [],
            user_groups: game.user_groups || '',
            launchers: game.launchers ? JSON.parse(game.launchers) : [],
            never_use_parent_license: game.never_use_parent_license || false,
            image_600x900: game.image_600x900 || '',
            image_background: game.image_background || '',
            logo_url: game.logo_url || '',
        });
        setEditModal(true);
    };

    const closeEditModal = () => {
        setEditModal(false);
        setEditingGame(null);
        setEditForm(blankForm);
    };

    const saveGame = async () => {
        try {
            const response = await fetch(`/api/games/${editingGame.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...editForm,
                    tags: JSON.stringify(editForm.tags),
                    pc_groups: JSON.stringify(editForm.pc_groups),
                    launchers: JSON.stringify(editForm.launchers),
                }),
            });
            if (response.ok) {
                const updatedGame = await response.json();
                setGames((prev) =>
                    prev.map((g) => (g.id === editingGame.id ? updatedGame : g))
                );
                closeEditModal();
            }
        } catch (_e) {
            // fail-soft
        }
    };

    const addTag = (tag) => {
        if (tag && !editForm.tags.includes(tag)) {
            setEditForm((prev) => ({ ...prev, tags: [...prev.tags, tag] }));
        }
    };
    const removeTag = (tagToRemove) => {
        setEditForm((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tagToRemove) }));
    };
    const addLauncher = () => {
        setEditForm((prev) => ({
            ...prev,
            launchers: [...prev.launchers, { name: '', path: '', parameters: '' }],
        }));
    };
    const updateLauncher = (index, field, value) => {
        setEditForm((prev) => ({
            ...prev,
            launchers: prev.launchers.map((l, i) => (i === index ? { ...l, [field]: value } : l)),
        }));
    };
    const removeLauncher = (index) => {
        setEditForm((prev) => ({
            ...prev,
            launchers: prev.launchers.filter((_, i) => i !== index),
        }));
    };

    if (loading && games.length === 0) {
        return (
            <div className='text-xl text-white font-semibold mb-4'>
                Client/Games &amp; apps
                <div className='text-gray-400 text-sm mt-2'>Loading games...</div>
            </div>
        );
    }

    return (
        <div>
            <div className='text-xl text-white font-semibold mb-4'>Client/Games &amp; apps</div>

            <div className='settings-card p-4 mb-4'>
                <div className='flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0'>
                    <div className='flex-1'>
                        <input
                            type='text'
                            placeholder='Search games &amp; apps'
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className='settings-input w-full lg:w-80'
                        />
                    </div>
                    <div className='flex space-x-2'>
                        {[
                            { key: 'all', label: 'All' },
                            { key: 'enabled', label: 'Enabled' },
                            { key: 'disabled', label: 'Disabled' },
                            { key: 'top100', label: 'Top 100' },
                            { key: 'newly', label: 'Newly added' },
                        ].map(({ key, label }) => (
                            <button
                                key={key}
                                onClick={() => setFilter(key)}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                    filter === key
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className='text-gray-400 text-sm'>Results: {totalCount} games</div>
                </div>
            </div>

            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4'>
                {games.map((game) => (
                    <div
                        key={game.id}
                        className='bg-gray-800 rounded-lg p-3 relative group cursor-pointer hover:bg-gray-700 transition-colors'
                        onClick={() => openEditModal(game)}
                    >
                        <div className='relative mb-3'>
                            <div className='w-full h-24 bg-gray-700 rounded-lg flex items-center justify-center overflow-hidden'>
                                {game.logo_url ? (
                                    <img
                                        src={game.logo_url}
                                        alt={game.name}
                                        className='w-full h-full object-cover'
                                        onError={(e) => {
                                            e.target.style.display = 'none';
                                        }}
                                    />
                                ) : (
                                    <div className='w-full h-full bg-gray-600 flex items-center justify-center text-gray-400 text-xs text-center'>
                                        {game.name.substring(0, 2).toUpperCase()}
                                    </div>
                                )}
                            </div>
                            <div className='absolute top-2 right-2' onClick={(e) => e.stopPropagation()}>
                                <label className='relative inline-flex items-center cursor-pointer'>
                                    <input
                                        type='checkbox'
                                        checked={game.enabled}
                                        onChange={() => toggleGame(game.id, game.enabled)}
                                        className='sr-only peer'
                                    />
                                    <div
                                        className={`w-8 h-4 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all ${
                                            game.enabled ? 'bg-green-500' : 'bg-gray-600'
                                        }`}
                                    ></div>
                                </label>
                            </div>
                        </div>
                        <div className='text-white text-xs font-medium text-center line-clamp-2'>
                            {game.name}
                        </div>
                    </div>
                ))}
            </div>

            {editModal && (
                <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
                    <div className='bg-gray-800 rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto'>
                        <div className='flex justify-between items-center mb-6'>
                            <h2 className='text-xl font-semibold text-white'>
                                Edit &apos;{editingGame?.name}&apos;
                            </h2>
                            <button
                                onClick={closeEditModal}
                                className='text-gray-400 hover:text-white text-2xl'
                            >
                                ×
                            </button>
                        </div>

                        <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
                            <div className='space-y-4'>
                                <div>
                                    <label className='block text-sm font-medium text-gray-300 mb-2'>
                                        Application Type
                                    </label>
                                    <select
                                        value={editForm.category}
                                        onChange={(e) =>
                                            setEditForm((prev) => ({ ...prev, category: e.target.value }))
                                        }
                                        className='settings-input w-full'
                                    >
                                        <option value='game'>Game</option>
                                        <option value='app'>Application</option>
                                    </select>
                                </div>

                                <div>
                                    <label className='block text-sm font-medium text-gray-300 mb-2'>
                                        Age Rating
                                    </label>
                                    <input
                                        type='number'
                                        value={editForm.age_rating}
                                        onChange={(e) =>
                                            setEditForm((prev) => ({
                                                ...prev,
                                                age_rating: parseInt(e.target.value) || 0,
                                            }))
                                        }
                                        className='settings-input w-full'
                                        min='0'
                                        max='18'
                                    />
                                </div>

                                <div>
                                    <label className='block text-sm font-medium text-gray-300 mb-2'>Tags</label>
                                    <div className='flex flex-wrap gap-2 mb-2'>
                                        {editForm.tags.map((tag) => (
                                            <span
                                                key={tag}
                                                className='bg-blue-600 text-white px-2 py-1 rounded text-sm flex items-center'
                                            >
                                                {tag}
                                                <button
                                                    onClick={() => removeTag(tag)}
                                                    className='ml-2 text-white hover:text-red-300'
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                    <input
                                        type='text'
                                        placeholder='Add tag'
                                        onKeyPress={(e) => {
                                            if (e.key === 'Enter') {
                                                addTag(e.target.value);
                                                e.target.value = '';
                                            }
                                        }}
                                        className='settings-input w-full'
                                    />
                                </div>

                                <div>
                                    <label className='block text-sm font-medium text-gray-300 mb-2'>
                                        Link to official website
                                    </label>
                                    <input
                                        type='url'
                                        value={editForm.website}
                                        onChange={(e) =>
                                            setEditForm((prev) => ({ ...prev, website: e.target.value }))
                                        }
                                        className='settings-input w-full'
                                        placeholder='https://example.com'
                                    />
                                </div>

                                <div>
                                    <label className='block text-sm font-medium text-gray-300 mb-2'>
                                        Eligible PC groups
                                    </label>
                                    <select
                                        value={editForm.pc_groups[0] || ''}
                                        onChange={(e) =>
                                            setEditForm((prev) => ({ ...prev, pc_groups: [e.target.value] }))
                                        }
                                        className='settings-input w-full'
                                    >
                                        <option value=''>Select PC group</option>
                                        <option value='General Systems'>General Systems</option>
                                        <option value='Gaming PCs'>Gaming PCs</option>
                                        <option value='Workstations'>Workstations</option>
                                    </select>
                                </div>

                                <div>
                                    <label className='block text-sm font-medium text-gray-300 mb-2'>
                                        Eligible user groups
                                    </label>
                                    <input
                                        type='text'
                                        value={editForm.user_groups}
                                        onChange={(e) =>
                                            setEditForm((prev) => ({ ...prev, user_groups: e.target.value }))
                                        }
                                        className='settings-input w-full'
                                        placeholder='Enter user groups'
                                    />
                                </div>
                            </div>

                            <div className='space-y-4'>
                                <div>
                                    <label className='block text-sm font-medium text-gray-300 mb-2'>
                                        Launchers
                                    </label>
                                    <div className='space-y-2'>
                                        {editForm.launchers.map((launcher, index) => (
                                            <div key={index} className='bg-gray-700 p-3 rounded'>
                                                <div className='flex justify-between items-center mb-2'>
                                                    <span className='text-white text-sm'>Launcher {index + 1}</span>
                                                    <button
                                                        onClick={() => removeLauncher(index)}
                                                        className='text-red-400 hover:text-red-300'
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                                <input
                                                    type='text'
                                                    value={launcher.path || ''}
                                                    onChange={(e) =>
                                                        updateLauncher(index, 'path', e.target.value)
                                                    }
                                                    className='settings-input w-full mb-2'
                                                    placeholder='Launcher path'
                                                />
                                                <input
                                                    type='text'
                                                    value={launcher.parameters || ''}
                                                    onChange={(e) =>
                                                        updateLauncher(index, 'parameters', e.target.value)
                                                    }
                                                    className='settings-input w-full'
                                                    placeholder='Launch parameters'
                                                />
                                            </div>
                                        ))}
                                        <button
                                            onClick={addLauncher}
                                            className='w-full px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-500'
                                        >
                                            Add new launcher
                                        </button>
                                    </div>
                                </div>

                                <div className='flex items-center'>
                                    <input
                                        type='checkbox'
                                        id='never-use-parent'
                                        checked={editForm.never_use_parent_license}
                                        onChange={(e) =>
                                            setEditForm((prev) => ({
                                                ...prev,
                                                never_use_parent_license: e.target.checked,
                                            }))
                                        }
                                        className='mr-2'
                                    />
                                    <label htmlFor='never-use-parent' className='text-sm text-gray-300'>
                                        Never use parent license for this game
                                    </label>
                                </div>

                                <div className='space-y-4'>
                                    <div>
                                        <label className='block text-sm font-medium text-gray-300 mb-2'>
                                            Image 600x900
                                        </label>
                                        <input
                                            type='url'
                                            value={editForm.image_600x900}
                                            onChange={(e) =>
                                                setEditForm((prev) => ({
                                                    ...prev,
                                                    image_600x900: e.target.value,
                                                }))
                                            }
                                            className='settings-input w-full'
                                            placeholder='Poster image URL'
                                        />
                                    </div>
                                    <div>
                                        <label className='block text-sm font-medium text-gray-300 mb-2'>
                                            Image (background)
                                        </label>
                                        <input
                                            type='url'
                                            value={editForm.image_background}
                                            onChange={(e) =>
                                                setEditForm((prev) => ({
                                                    ...prev,
                                                    image_background: e.target.value,
                                                }))
                                            }
                                            className='settings-input w-full'
                                            placeholder='Background image URL'
                                        />
                                    </div>
                                    <div>
                                        <label className='block text-sm font-medium text-gray-300 mb-2'>
                                            Logo icon
                                        </label>
                                        <input
                                            type='url'
                                            value={editForm.logo_url}
                                            onChange={(e) =>
                                                setEditForm((prev) => ({ ...prev, logo_url: e.target.value }))
                                            }
                                            className='settings-input w-full'
                                            placeholder='Logo image URL'
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className='flex justify-end space-x-4 mt-6 pt-6 border-t border-gray-700'>
                            <button
                                onClick={closeEditModal}
                                className='px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500'
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveGame}
                                className='px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700'
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {totalCount > pageSize && (
                <div className='flex justify-center mt-6'>
                    <div className='flex space-x-2'>
                        <button
                            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                            disabled={currentPage === 0}
                            className='px-4 py-2 bg-gray-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed'
                        >
                            Previous
                        </button>
                        <span className='px-4 py-2 text-white'>
                            Page {currentPage + 1} of {Math.ceil(totalCount / pageSize)}
                        </span>
                        <button
                            onClick={() => setCurrentPage((p) => p + 1)}
                            disabled={currentPage >= Math.ceil(totalCount / pageSize) - 1}
                            className='px-4 py-2 bg-gray-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed'
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ClientGamesApps;
