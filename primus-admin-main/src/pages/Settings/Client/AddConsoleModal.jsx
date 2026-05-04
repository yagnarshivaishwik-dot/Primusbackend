import React, { useState } from 'react';
import PropTypes from 'prop-types';

function AddConsoleModal({ onClose, onAdd }) {
    const [consoleName, setConsoleName] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (consoleName.trim()) {
            onAdd(consoleName.trim());
            setConsoleName('');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-xl" style={{ background: '#1a1d21', border: '1px solid #2a2d31' }}>
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <h3 className="text-white font-semibold">Add Console</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
                </div>
                <form onSubmit={handleSubmit} className="p-4">
                    <div className="mb-4">
                        <label className="text-gray-400 text-sm mb-2 block">Console Name</label>
                        <input
                            type="text"
                            value={consoleName}
                            onChange={(e) => setConsoleName(e.target.value)}
                            className="search-input w-full rounded-md px-3 py-2"
                            placeholder="e.g., PlayStation 5, Xbox Series X"
                            autoFocus
                        />
                    </div>
                    <div className="flex space-x-3">
                        <button
                            type="submit"
                            className="settings-button-primary rounded-md px-4 py-2 flex-1"
                            disabled={!consoleName.trim()}
                        >
                            Add Console
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="settings-button rounded-md px-4 py-2"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

AddConsoleModal.propTypes = {
    onClose: PropTypes.func.isRequired,
    onAdd: PropTypes.func.isRequired
};

export default AddConsoleModal;
