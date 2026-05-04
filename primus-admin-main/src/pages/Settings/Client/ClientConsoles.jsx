import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { showToast } from '../../../utils/api';
import { settingsAPI, settingsToObject, objectToSettings } from '../../../utils/settings.js';
import AddConsoleModal from './AddConsoleModal.jsx';

function ClientConsoles() {
    const [consoleSettings, setConsoleSettings] = useState({
        consoles: [],
        auto_logout_enabled: true
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);

    useEffect(() => {
        loadConsoleSettings();
    }, []);

    const loadConsoleSettings = async () => {
        try {
            const settings = await settingsAPI.getSettingsByCategory('client_consoles');
            const settingsObj = settingsToObject(settings);
            setConsoleSettings(prev => ({ ...prev, ...settingsObj }));
        } catch (error) {
            showToast('Failed to load console settings');
        } finally {
            setLoading(false);
        }
    };

    const saveConsoleSettings = async () => {
        setSaving(true);
        try {
            const settingsArray = objectToSettings(consoleSettings, 'client_consoles');
            await settingsAPI.bulkUpdateSettings(settingsArray);
            showToast('Console settings saved successfully');
        } catch (error) {
            showToast('Failed to save console settings');
        } finally {
            setSaving(false);
        }
    };

    const addConsole = (consoleName) => {
        const newConsole = {
            id: Date.now(),
            name: consoleName,
            enabled: true
        };
        setConsoleSettings(prev => ({
            ...prev,
            consoles: Array.isArray(prev.consoles) ? [...prev.consoles, newConsole] : [newConsole]
        }));
        setShowAddModal(false);
    };

    const removeConsole = (consoleId) => {
        setConsoleSettings(prev => ({
            ...prev,
            consoles: Array.isArray(prev.consoles) ? prev.consoles.filter(c => c.id !== consoleId) : []
        }));
    };

    if (loading) {
        return (
            <div className="text-xl text-white font-semibold mb-4">
                Client/Consoles
                <div className="text-gray-400 text-sm mt-2">Loading console settings...</div>
            </div>
        );
    }

    const consoles = Array.isArray(consoleSettings.consoles) ? consoleSettings.consoles : [];

    return (
        <div>
            <div className="text-xl text-white font-semibold mb-4">Client/Consoles</div>

            <div className="settings-card p-4 mb-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="text-lg text-white font-medium">Consoles</div>
                    <button
                        className="settings-button-primary rounded-md px-4 py-2"
                        onClick={() => setShowAddModal(true)}
                    >
                        + Add console
                    </button>
                </div>

                {consoles.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="text-6xl mb-4">🎮</div>
                        <div className="text-white font-medium text-lg mb-2">No consoles found!</div>
                        <div className="text-gray-400 mb-4">Click on the button below to add the console</div>
                        <button
                            className="settings-button rounded-md px-4 py-2"
                            onClick={() => setShowAddModal(true)}
                        >
                            Add console
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {consoles.map((console, index) => (
                            <div key={index} className="bg-gray-800 rounded-lg p-3 flex items-center justify-between">
                                <div className="text-white">{console.name}</div>
                                <button
                                    className="text-red-400 hover:text-red-300 text-sm"
                                    onClick={() => removeConsole(console.id)}
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="mt-6 pt-4 border-t border-gray-700">
                    <div className="flex items-center space-x-3">
                        <Toggle
                            value={consoleSettings.auto_logout_enabled}
                            onChange={(value) => setConsoleSettings(prev => ({ ...prev, auto_logout_enabled: value }))}
                        />
                        <div className="text-white">
                            <div className="font-medium">Auto logout users from consoles</div>
                            <div className="text-gray-400 text-sm">Automatically log out users from console sessions when idle</div>
                        </div>
                    </div>
                </div>

                <div className="mt-6">
                    <button
                        className="settings-button-primary rounded-md px-4 py-2"
                        onClick={saveConsoleSettings}
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : 'Save changes'}
                    </button>
                </div>
            </div>

            {/* Add Console Modal */}
            {showAddModal && (
                <AddConsoleModal
                    onClose={() => setShowAddModal(false)}
                    onAdd={addConsole}
                />
            )}
        </div>
    );
}

// Local toggle helper (kept inline to avoid coupling with the Center settings tree
// extraction which is owned by a parallel agent).
function Toggle({ label, value, onChange }) {
    const handleToggle = () => {
        if (onChange) {
            onChange(!value);
        }
    };

    return <div className="flex items-center justify-between bg-white/5 p-3 rounded-md mb-2">
        <div className="text-gray-300">{label}</div>
        <button className={`w-10 h-6 rounded-full ${value ? 'bg-primary' : 'bg-gray-600'}`} onClick={handleToggle}><span className={`block w-5 h-5 bg-white rounded-full transform transition ${value ? 'translate-x-5' : 'translate-x-0'}`}></span></button>
    </div>;
}

Toggle.propTypes = {
    label: PropTypes.string,
    value: PropTypes.bool,
    onChange: PropTypes.func
};

export default ClientConsoles;
