import React, { useState, useEffect } from 'react';
import { showToast } from '../../../utils/api';
import { settingsAPI, settingsToObject, objectToSettings } from '../../../utils/settings.js';

function ClientAdvanced() {
    const [advancedSettings, setAdvancedSettings] = useState({
        startup_commands: [],
        client_applications: [],
        whitelisted_apps: []
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showAddCommand, setShowAddCommand] = useState(false);
    const [showAddApplication, setShowAddApplication] = useState(false);
    const [showAddWhitelistedApp, setShowAddWhitelistedApp] = useState(false);

    // Modal states
    const [newCommand, setNewCommand] = useState({
        full_path: '',
        parameter: '',
        working_directory: '',
        run_in_cmd: false,
        trigger_type: 'Startup',
        long_running: false
    });

    const [newApplication, setNewApplication] = useState({
        name: '',
        path: '',
        parameters: ''
    });

    const [newWhitelistedApp, setNewWhitelistedApp] = useState({
        process_name: ''
    });

    useEffect(() => {
        loadAdvancedSettings();
    }, []);

    const loadAdvancedSettings = async () => {
        try {
            const settings = await settingsAPI.getSettingsByCategory('client_advanced');
            const settingsObj = settingsToObject(settings);
            setAdvancedSettings(prev => ({ ...prev, ...settingsObj }));
        } catch (error) {
            showToast('Failed to load advanced settings');
        } finally {
            setLoading(false);
        }
    };

    const saveAdvancedSettings = async () => {
        setSaving(true);
        try {
            const settingsArray = objectToSettings(advancedSettings, 'client_advanced');
            await settingsAPI.bulkUpdateSettings(settingsArray);
            showToast('Advanced settings saved successfully');
        } catch (error) {
            showToast('Failed to save advanced settings');
        } finally {
            setSaving(false);
        }
    };

    const addCommand = () => {
        if (!newCommand.full_path.trim()) {
            showToast('Full path is required');
            return;
        }

        const command = {
            id: Date.now(),
            ...newCommand
        };

        setAdvancedSettings(prev => ({
            ...prev,
            startup_commands: [...prev.startup_commands, command]
        }));

        setNewCommand({
            full_path: '',
            parameter: '',
            working_directory: '',
            run_in_cmd: false,
            trigger_type: 'Startup',
            long_running: false
        });
        setShowAddCommand(false);
        showToast('Command added successfully');
    };

    const removeCommand = (id) => {
        setAdvancedSettings(prev => ({
            ...prev,
            startup_commands: prev.startup_commands.filter(cmd => cmd.id !== id)
        }));
        showToast('Command removed');
    };

    const addApplication = () => {
        if (!newApplication.name.trim() || !newApplication.path.trim()) {
            showToast('Name and path are required');
            return;
        }

        const application = {
            id: Date.now(),
            ...newApplication
        };

        setAdvancedSettings(prev => ({
            ...prev,
            client_applications: [...prev.client_applications, application]
        }));

        setNewApplication({
            name: '',
            path: '',
            parameters: ''
        });
        setShowAddApplication(false);
        showToast('Application added successfully');
    };

    const removeApplication = (id) => {
        setAdvancedSettings(prev => ({
            ...prev,
            client_applications: prev.client_applications.filter(app => app.id !== id)
        }));
        showToast('Application removed');
    };

    const addWhitelistedApp = () => {
        if (!newWhitelistedApp.process_name.trim()) {
            showToast('Process name is required');
            return;
        }

        const app = {
            id: Date.now(),
            ...newWhitelistedApp
        };

        setAdvancedSettings(prev => ({
            ...prev,
            whitelisted_apps: [...prev.whitelisted_apps, app]
        }));

        setNewWhitelistedApp({
            process_name: ''
        });
        setShowAddWhitelistedApp(false);
        showToast('Whitelisted app added successfully');
    };

    const removeWhitelistedApp = (id) => {
        setAdvancedSettings(prev => ({
            ...prev,
            whitelisted_apps: prev.whitelisted_apps.filter(app => app.id !== id)
        }));
        showToast('Whitelisted app removed');
    };

    const triggerTypes = ['Startup', 'User login', 'Guest login', 'Logout', 'App launch'];

    if (loading) {
        return (
            <div className="text-xl text-white font-semibold mb-4">
                Client/Advanced
                <div className="text-gray-400 text-sm mt-2">Loading advanced settings...</div>
            </div>
        );
    }

    return (
        <div>
            <div className="text-xl text-white font-semibold mb-4">Client/Advanced</div>

            {/* Startup Commands */}
            <div className="settings-card p-4 mb-4">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <div className="text-lg text-white font-medium mb-2">Startup</div>
                        <div className="text-gray-400 text-sm">
                            Specify commands that Primus will run on each client on selected trigger type event. This can be used to copy network files, run local batch files, etc.
                        </div>
                        <div className="text-gray-400 text-sm mt-1">
                            Commands are run in the order they appear below. Currently, a client receives the startup commands on startup, but must be restarted once more before they will execute for the first time.
                        </div>
                    </div>
                    <button
                        onClick={() => setShowAddCommand(true)}
                        className="settings-button-primary rounded-md px-4 py-2 flex items-center space-x-2"
                    >
                        <span>+</span>
                        <span>Add command</span>
                    </button>
                </div>

                <div className="bg-gray-800 rounded-lg">
                    <div className="grid grid-cols-12 gap-4 p-3 border-b border-gray-700 text-gray-400 text-sm font-medium">
                        <div className="col-span-2">FULL PATH</div>
                        <div className="col-span-2">PARAMETER</div>
                        <div className="col-span-2">WORKING DIRECTORY</div>
                        <div className="col-span-1">RUN IN CMD</div>
                        <div className="col-span-2">TRIGGER TYPE</div>
                        <div className="col-span-2">LONG RUNNING</div>
                        <div className="col-span-1">ACTIONS</div>
                    </div>

                    {advancedSettings.startup_commands.length === 0 ? (
                        <div className="p-8 text-center text-gray-400">
                            No data to display
                        </div>
                    ) : (
                        advancedSettings.startup_commands.map((command) => (
                            <div key={command.id} className="grid grid-cols-12 gap-4 p-3 border-b border-gray-700 last:border-b-0 text-white text-sm">
                                <div className="col-span-2 truncate">{command.full_path}</div>
                                <div className="col-span-2 truncate">{command.parameter}</div>
                                <div className="col-span-2 truncate">{command.working_directory}</div>
                                <div className="col-span-1">{command.run_in_cmd ? 'Yes' : 'No'}</div>
                                <div className="col-span-2">{command.trigger_type}</div>
                                <div className="col-span-2">{command.long_running ? 'Yes' : 'No'}</div>
                                <div className="col-span-1">
                                    <button
                                        onClick={() => removeCommand(command.id)}
                                        className="text-red-400 hover:text-red-300"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="mt-4">
                    <button
                        onClick={saveAdvancedSettings}
                        className="settings-button rounded-md px-4 py-2"
                        disabled={saving}
                    >
                        Save changes
                    </button>
                </div>
            </div>

            {/* Client Applications */}
            <div className="settings-card p-4 mb-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="text-lg text-white font-medium">Client applications</div>
                    <button
                        onClick={() => setShowAddApplication(true)}
                        className="settings-button-primary rounded-md px-4 py-2 flex items-center space-x-2"
                    >
                        <span>+</span>
                        <span>Add new application</span>
                    </button>
                </div>

                <div className="bg-gray-800 rounded-lg">
                    <div className="grid grid-cols-6 gap-4 p-3 border-b border-gray-700 text-gray-400 text-sm font-medium">
                        <div className="col-span-2">NAME</div>
                        <div className="col-span-2">PATH</div>
                        <div className="col-span-1">PARAMETERS</div>
                        <div className="col-span-1">ACTIONS</div>
                    </div>

                    {advancedSettings.client_applications.length === 0 ? (
                        <div className="p-8 text-center text-gray-400">
                            No records available.
                        </div>
                    ) : (
                        advancedSettings.client_applications.map((app) => (
                            <div key={app.id} className="grid grid-cols-6 gap-4 p-3 border-b border-gray-700 last:border-b-0 text-white text-sm">
                                <div className="col-span-2 truncate">{app.name}</div>
                                <div className="col-span-2 truncate">{app.path}</div>
                                <div className="col-span-1 truncate">{app.parameters}</div>
                                <div className="col-span-1">
                                    <button
                                        onClick={() => removeApplication(app.id)}
                                        className="text-red-400 hover:text-red-300"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Whitelisted Apps */}
            <div className="settings-card p-4 mb-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="text-lg text-white font-medium">Whitelisted apps</div>
                    <button
                        onClick={() => setShowAddWhitelistedApp(true)}
                        className="settings-button-primary rounded-md px-4 py-2 flex items-center space-x-2"
                    >
                        <span>+</span>
                        <span>Add whitelisted app</span>
                    </button>
                </div>

                <div className="bg-gray-800 rounded-lg">
                    <div className="grid grid-cols-2 gap-4 p-3 border-b border-gray-700 text-gray-400 text-sm font-medium">
                        <div>PROCESS NAME</div>
                        <div>ACTIONS</div>
                    </div>

                    {advancedSettings.whitelisted_apps.length === 0 ? (
                        <div className="p-8 text-center text-gray-400">
                            No records available.
                        </div>
                    ) : (
                        advancedSettings.whitelisted_apps.map((app) => (
                            <div key={app.id} className="grid grid-cols-2 gap-4 p-3 border-b border-gray-700 last:border-b-0 text-white text-sm">
                                <div className="truncate">{app.process_name}</div>
                                <div>
                                    <button
                                        onClick={() => removeWhitelistedApp(app.id)}
                                        className="text-red-400 hover:text-red-300"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Add Command Modal */}
            {showAddCommand && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg text-white font-medium">Add command</h3>
                            <button
                                onClick={() => setShowAddCommand(false)}
                                className="text-gray-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-white text-sm mb-2">
                                    Full path *
                                </label>
                                <input
                                    type="text"
                                    value={newCommand.full_path}
                                    onChange={(e) => setNewCommand(prev => ({ ...prev, full_path: e.target.value }))}
                                    className="settings-input w-full"
                                    placeholder="Enter full path"
                                />
                            </div>

                            <div>
                                <label className="block text-white text-sm mb-2">
                                    Parameter
                                </label>
                                <input
                                    type="text"
                                    value={newCommand.parameter}
                                    onChange={(e) => setNewCommand(prev => ({ ...prev, parameter: e.target.value }))}
                                    className="settings-input w-full"
                                    placeholder="Enter parameter"
                                />
                            </div>

                            <div>
                                <label className="block text-white text-sm mb-2">
                                    Working directory
                                </label>
                                <input
                                    type="text"
                                    value={newCommand.working_directory}
                                    onChange={(e) => setNewCommand(prev => ({ ...prev, working_directory: e.target.value }))}
                                    className="settings-input w-full"
                                    placeholder="Enter working directory"
                                />
                            </div>

                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="run_in_cmd"
                                    checked={newCommand.run_in_cmd}
                                    onChange={(e) => setNewCommand(prev => ({ ...prev, run_in_cmd: e.target.checked }))}
                                    className="text-purple-500"
                                />
                                <label htmlFor="run_in_cmd" className="text-white text-sm">
                                    Run in cmd
                                </label>
                            </div>

                            <div>
                                <label className="block text-white text-sm mb-2">
                                    Trigger type *
                                </label>
                                <select
                                    value={newCommand.trigger_type}
                                    onChange={(e) => setNewCommand(prev => ({ ...prev, trigger_type: e.target.value }))}
                                    className="settings-input w-full"
                                >
                                    {triggerTypes.map(type => (
                                        <option key={type} value={type}>{type}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="long_running"
                                    checked={newCommand.long_running}
                                    onChange={(e) => setNewCommand(prev => ({ ...prev, long_running: e.target.checked }))}
                                    className="text-purple-500"
                                />
                                <label htmlFor="long_running" className="text-white text-sm">
                                    Long running
                                </label>
                            </div>
                        </div>

                        <div className="flex space-x-3 mt-6">
                            <button
                                onClick={() => setShowAddCommand(false)}
                                className="settings-button rounded-md px-4 py-2 flex-1"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={addCommand}
                                className="settings-button-primary rounded-md px-4 py-2 flex-1"
                            >
                                Add
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Application Modal */}
            {showAddApplication && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg text-white font-medium">Create new client application</h3>
                            <button
                                onClick={() => setShowAddApplication(false)}
                                className="text-gray-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-white text-sm mb-2">
                                    Name *
                                </label>
                                <input
                                    type="text"
                                    value={newApplication.name}
                                    onChange={(e) => setNewApplication(prev => ({ ...prev, name: e.target.value }))}
                                    className="settings-input w-full"
                                    placeholder="Enter application name"
                                />
                            </div>

                            <div>
                                <label className="block text-white text-sm mb-2">
                                    Path *
                                </label>
                                <input
                                    type="text"
                                    value={newApplication.path}
                                    onChange={(e) => setNewApplication(prev => ({ ...prev, path: e.target.value }))}
                                    className="settings-input w-full"
                                    placeholder="Enter application path"
                                />
                            </div>

                            <div>
                                <label className="block text-white text-sm mb-2">
                                    Parameters
                                </label>
                                <input
                                    type="text"
                                    value={newApplication.parameters}
                                    onChange={(e) => setNewApplication(prev => ({ ...prev, parameters: e.target.value }))}
                                    className="settings-input w-full"
                                    placeholder="Enter parameters"
                                />
                            </div>
                        </div>

                        <div className="flex space-x-3 mt-6">
                            <button
                                onClick={() => setShowAddApplication(false)}
                                className="settings-button rounded-md px-4 py-2 flex-1"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={addApplication}
                                className="settings-button-primary rounded-md px-4 py-2 flex-1"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Whitelisted App Modal */}
            {showAddWhitelistedApp && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg text-white font-medium">Add whitelisted app</h3>
                            <button
                                onClick={() => setShowAddWhitelistedApp(false)}
                                className="text-gray-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="mb-4">
                            <p className="text-gray-400 text-sm mb-4">
                                Add the process name of the application that should be whitelisted (eg notepad or notepad.exe).
                            </p>
                            <div>
                                <label className="block text-white text-sm mb-2">
                                    Process name *
                                </label>
                                <input
                                    type="text"
                                    value={newWhitelistedApp.process_name}
                                    onChange={(e) => setNewWhitelistedApp(prev => ({ ...prev, process_name: e.target.value }))}
                                    className="settings-input w-full"
                                    placeholder="Enter process name"
                                />
                            </div>
                        </div>

                        <div className="flex space-x-3 mt-6">
                            <button
                                onClick={() => setShowAddWhitelistedApp(false)}
                                className="settings-button rounded-md px-4 py-2 flex-1"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={addWhitelistedApp}
                                className="settings-button-primary rounded-md px-4 py-2 flex-1"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ClientAdvanced;
