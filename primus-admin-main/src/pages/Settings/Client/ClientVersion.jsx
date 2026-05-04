import React, { useState, useEffect } from 'react';
import { showToast } from '../../../utils/api';
import { settingsAPI, settingsToObject, objectToSettings } from '../../../utils/settings.js';

function ClientVersion() {
    const [versionSettings, setVersionSettings] = useState({
        latest_stable: '3.0.1467.0',
        latest_beta: '3.0.1481.0',
        latest_alpha: '3.0.1503.0',
        current_versions: ['vaishwik Version: 3.0.1481.0 (Beta)']
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadVersionSettings();
    }, []);

    const loadVersionSettings = async () => {
        try {
            const settings = await settingsAPI.getSettingsByCategory('client_version');
            const settingsObj = settingsToObject(settings);
            setVersionSettings(prev => ({ ...prev, ...settingsObj }));
        } catch (error) {
            showToast('Failed to load version settings');
        } finally {
            setLoading(false);
        }
    };

    const saveVersionSettings = async () => {
        setSaving(true);
        try {
            const settingsArray = objectToSettings(versionSettings, 'client_version');
            await settingsAPI.bulkUpdateSettings(settingsArray);
            showToast('Version settings saved successfully');
        } catch (error) {
            showToast('Failed to save version settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="text-xl text-white font-semibold mb-4">
                Client/Version
                <div className="text-gray-400 text-sm mt-2">Loading version settings...</div>
            </div>
        );
    }

    return (
        <div>
            <div className="text-xl text-white font-semibold mb-4">Client/Version</div>

            <div className="settings-card p-4 mb-4">
                <div className="text-lg text-white font-medium mb-2">Primus version settings</div>
                <div className="text-gray-400 text-sm mb-4">
                    Client versions setting will determine the version of Primus software running on your gaming PCs. Stable is the minimum version that is supported. Beta versions will have been tested in dozens of centers, and alpha versions are very new. We recommend testing beta/alpha versions on a small number of PCs initially.
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                    <div className="text-blue-400 cursor-pointer hover:text-blue-300">
                        <div className="flex items-center space-x-2 mb-1">
                            <span>📋</span>
                            <span>View latest changelog</span>
                        </div>
                    </div>
                    <div className="text-blue-400 cursor-pointer hover:text-blue-300">
                        <div className="flex items-center space-x-2 mb-1">
                            <span>📋</span>
                            <span>How to update your PCs</span>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-800 rounded-lg p-4 mb-4">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm">
                        <div>
                            <div className="text-gray-400 mb-1">LATEST STABLE VERSION</div>
                            <div className="text-white font-medium">{versionSettings.latest_stable}</div>
                        </div>
                        <div>
                            <div className="text-gray-400 mb-1">LATEST BETA VERSION</div>
                            <div className="text-white font-medium">{versionSettings.latest_beta}</div>
                        </div>
                        <div>
                            <div className="text-gray-400 mb-1">LATEST ALPHA VERSION</div>
                            <div className="text-white font-medium">{versionSettings.latest_alpha}</div>
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    {Array.isArray(versionSettings.current_versions) ?
                        versionSettings.current_versions.map((version, index) => (
                            <div key={index} className="flex items-center space-x-3">
                                <input type="checkbox" className="w-4 h-4 text-purple-500" />
                                <span className="text-white">{version}</span>
                            </div>
                        )) :
                        <div className="flex items-center space-x-3">
                            <input type="checkbox" className="w-4 h-4 text-purple-500" />
                            <span className="text-white">vaishwik Version: 3.0.1481.0 (Beta)</span>
                        </div>
                    }
                </div>

                <div className="flex space-x-3 mt-4">
                    <button className="settings-button rounded-md px-4 py-2 hover:bg-gray-600">Change version</button>
                    <button className="settings-button rounded-md px-4 py-2 hover:bg-gray-600">Select all</button>
                    <button className="settings-button rounded-md px-4 py-2 hover:bg-gray-600">Clear all</button>
                </div>

                <div className="mt-6">
                    <button
                        className="settings-button-primary rounded-md px-4 py-2"
                        onClick={saveVersionSettings}
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : 'Save changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ClientVersion;
