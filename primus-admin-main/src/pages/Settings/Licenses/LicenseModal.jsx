import React, { useState } from 'react';
import { showToast } from '../../../utils/api';

function Field({ label, children }) {
    return <div className='mb-3'><div className='text-gray-300 text-sm mb-1'>{label}</div>{children}</div>;
}

function LicenseModal({ onClose, onCreate }) {
    const [name, setName] = useState('');
    const [selectedGames, setSelectedGames] = useState([]);
    const [filter, setFilter] = useState('');
    const [creating, setCreating] = useState(false);

    const options = [
        'Among Us', 'Apex Legends', 'Battle.net', 'Call of Duty: Modern Warfare II | Warzone™ 2.0',
        'Counter-Strike 2', 'Destiny 2', 'Discord', 'Display Settings', 'Dota 2',
        'Epic Games Launcher', 'Fall Guys', 'Fortnite', 'Google Chrome', 'League Of Legends',
        'Marvel Rivals', 'Minecraft', 'Overwatch 2', 'PUBG', 'Rainbow Six Siege',
        'Rocket League', 'Sea of Thieves', 'Steam', 'Team Fortress 2', 'Valorant',
        'World of Warcraft', 'Xbox Game Pass'
    ];

    const filteredOptions = options.filter(option =>
        option.toLowerCase().includes(filter.toLowerCase())
    );

    const toggleGame = (game) => {
        setSelectedGames(prev =>
            prev.includes(game)
                ? prev.filter(g => g !== game)
                : [...prev, game]
        );
    };

    const handleCreate = async () => {
        if (!name.trim()) {
            showToast('Please enter a pool name', 'error');
            return;
        }

        if (selectedGames.length === 0) {
            showToast('Please select at least one game', 'error');
            return;
        }

        setCreating(true);
        try {
            await onCreate({
                name: name.trim(),
                games: selectedGames
            });
            // Reset form
            setName('');
            setSelectedGames([]);
            setFilter('');
        } catch (error) {
            // Error toast is shown by the parent's onCreate handler
        } finally {
            setCreating(false);
        }
    };

    const removeGame = (game) => {
        setSelectedGames(prev => prev.filter(g => g !== game));
    };

    return (
        <div className='fixed inset-0 bg-black/70 flex items-center justify-center z-50' onClick={onClose}>
            <div className='calendar-pop w-[600px] max-h-[80vh] overflow-hidden' onClick={e => e.stopPropagation()}>
                <div className='text-white text-lg font-semibold mb-3 flex items-center justify-between'>
                    Create license pool
                    <button className='text-gray-400 hover:text-white' onClick={onClose}>✕</button>
                </div>

                <Field label='Pool Name *'>
                    <input
                        className='search-input w-full rounded-md px-3 py-2'
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder='Enter license pool name'
                    />
                </Field>

                {/* Selected Games */}
                {selectedGames.length > 0 && (
                    <div className='mb-4'>
                        <div className='text-gray-300 text-sm mb-2'>Selected Games ({selectedGames.length})</div>
                        <div className='flex flex-wrap gap-2 max-h-20 overflow-y-auto'>
                            {selectedGames.map(game => (
                                <div key={game} className='pill inline-flex items-center gap-2 bg-primary/20'>
                                    <span className='text-sm'>{game}</span>
                                    <button
                                        className='text-red-400 hover:text-red-300'
                                        onClick={() => removeGame(game)}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <Field label='Available Games'>
                    <input
                        className='search-input w-full rounded-md px-3 py-2 mb-2'
                        placeholder='Search games...'
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                    <div className='max-h-48 overflow-auto border border-white/10 rounded-md'>
                        {filteredOptions.length === 0 ? (
                            <div className='px-3 py-4 text-gray-400 text-center'>
                                No games found matching &quot;{filter}&quot;
                            </div>
                        ) : (
                            filteredOptions.map(option => {
                                const isSelected = selectedGames.includes(option);
                                return (
                                    <div
                                        key={option}
                                        className={`px-3 py-2 cursor-pointer border-b border-white/5 last:border-b-0 ${isSelected ? 'bg-primary/20 text-primary' : 'hover:bg-white/10'
                                            }`}
                                        onClick={() => toggleGame(option)}
                                    >
                                        <div className='flex items-center gap-2'>
                                            <input
                                                type='checkbox'
                                                checked={isSelected}
                                                onChange={() => toggleGame(option)}
                                                className='mr-2'
                                            />
                                            {option}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </Field>

                <div className='flex justify-end gap-2 mt-4'>
                    <button
                        className='pill'
                        onClick={onClose}
                        disabled={creating}
                    >
                        Cancel
                    </button>
                    <button
                        className='btn-primary-neo px-3 py-1.5 rounded-md'
                        onClick={handleCreate}
                        disabled={!name.trim() || selectedGames.length === 0 || creating}
                    >
                        {creating ? 'Creating...' : 'Create Pool'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default LicenseModal;
