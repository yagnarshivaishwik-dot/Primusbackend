import { useState, useEffect } from 'react';
import { showToast } from '../../../utils/api';
import { settingsAPI, settingsToObject, objectToSettings } from '../../../utils/settings';

// Phase 3 extraction from AdminUI.jsx (originally lines 1886-2425).
// Audit cleanup applied: removed dead-local saveSecuritySettings (was flagged
// in admin_lint.txt as no-unused-vars). The save flow lives inline in the UI's
// own button handlers using settingsAPI.bulkUpdateSettings directly when
// needed.

function ClientSecurity() {
    const [securitySettings, setSecuritySettings] = useState({
        computers: [],
        security_groups: [],
        selected_computer_filter: 'all',
    });
    const [loading, setLoading] = useState(true);
    const [showAddSecurityGroup, setShowAddSecurityGroup] = useState(false);
    const [selectedComputer, setSelectedComputer] = useState(null);

    const [newSecurityGroup, setNewSecurityGroup] = useState({
        name: '',
        system_settings: {
            task_manager: false,
            batch_files: false,
            usb_access: false,
            powershell: false,
            power_button_action: false,
        },
        browser_settings: {
            incognito_mode: 'Available',
            file_explorer: false,
            file_download: false,
            extensions: false,
        },
        disabled_hard_drives: [],
        blocked_applications: [],
        url_blacklist: [],
    });

    useEffect(() => {
        const loadSecuritySettings = async () => {
            try {
                const settings = await settingsAPI.getSettingsByCategory('client_security');
                const settingsObj = settingsToObject(settings);
                setSecuritySettings((prev) => ({ ...prev, ...settingsObj }));
                if (!settingsObj.computers || settingsObj.computers.length === 0) {
                    setSecuritySettings((prev) => ({
                        ...prev,
                        computers: [{ id: 1, name: 'vaishwik', group: null }],
                    }));
                }
            } catch (_e) {
                showToast('Failed to load security settings');
            } finally {
                setLoading(false);
            }
        };
        loadSecuritySettings();
    }, []);

    const persistSecuritySettings = async (next) => {
        try {
            const settingsArray = objectToSettings(next, 'client_security');
            await settingsAPI.bulkUpdateSettings(settingsArray);
            showToast('Security settings saved successfully');
        } catch (_e) {
            showToast('Failed to save security settings');
        }
    };

    const addSecurityGroup = () => {
        if (!newSecurityGroup.name.trim()) {
            showToast('Security group name is required');
            return;
        }
        const group = { id: Date.now(), ...newSecurityGroup };
        const next = {
            ...securitySettings,
            security_groups: [...securitySettings.security_groups, group],
        };
        setSecuritySettings(next);
        persistSecuritySettings(next);
        setNewSecurityGroup({
            name: '',
            system_settings: {
                task_manager: false,
                batch_files: false,
                usb_access: false,
                powershell: false,
                power_button_action: false,
            },
            browser_settings: {
                incognito_mode: 'Available',
                file_explorer: false,
                file_download: false,
                extensions: false,
            },
            disabled_hard_drives: [],
            blocked_applications: [],
            url_blacklist: [],
        });
        setShowAddSecurityGroup(false);
        showToast('Security group added successfully');
    };

    const removeSecurityGroup = (id) => {
        const next = {
            ...securitySettings,
            security_groups: securitySettings.security_groups.filter((g) => g.id !== id),
        };
        setSecuritySettings(next);
        persistSecuritySettings(next);
        showToast('Security group removed');
    };

    const updateSystemSetting = (setting, value) => {
        setNewSecurityGroup((prev) => ({
            ...prev,
            system_settings: { ...prev.system_settings, [setting]: value },
        }));
    };

    const updateBrowserSetting = (setting, value) => {
        setNewSecurityGroup((prev) => ({
            ...prev,
            browser_settings: { ...prev.browser_settings, [setting]: value },
        }));
    };

    const addDisabledDrive = (drive) => {
        if (drive && !newSecurityGroup.disabled_hard_drives.includes(drive)) {
            setNewSecurityGroup((prev) => ({
                ...prev,
                disabled_hard_drives: [...prev.disabled_hard_drives, drive],
            }));
        }
    };

    const removeDisabledDrive = (drive) => {
        setNewSecurityGroup((prev) => ({
            ...prev,
            disabled_hard_drives: prev.disabled_hard_drives.filter((d) => d !== drive),
        }));
    };

    const addBlockedApplication = (app) => {
        if (app && !newSecurityGroup.blocked_applications.includes(app)) {
            setNewSecurityGroup((prev) => ({
                ...prev,
                blocked_applications: [...prev.blocked_applications, app],
            }));
        }
    };

    const removeBlockedApplication = (app) => {
        setNewSecurityGroup((prev) => ({
            ...prev,
            blocked_applications: prev.blocked_applications.filter((a) => a !== app),
        }));
    };

    const addUrlToBlacklist = (url) => {
        if (url && !newSecurityGroup.url_blacklist.includes(url)) {
            setNewSecurityGroup((prev) => ({
                ...prev,
                url_blacklist: [...prev.url_blacklist, url],
            }));
        }
    };

    const removeUrlFromBlacklist = (url) => {
        setNewSecurityGroup((prev) => ({
            ...prev,
            url_blacklist: prev.url_blacklist.filter((u) => u !== url),
        }));
    };

    const incognitoOptions = ['Available', 'Forced', 'Disabled'];

    if (loading) {
        return (
            <div className='text-xl text-white font-semibold mb-4'>
                Client/Security
                <div className='text-gray-400 text-sm mt-2'>Loading security settings...</div>
            </div>
        );
    }

    return (
        <div>
            <div className='text-xl text-white font-semibold mb-4'>Client/Security</div>

            <div className='settings-card p-4 mb-4'>
                <div className='flex items-center justify-between mb-4'>
                    <div>
                        <div className='text-lg text-white font-medium mb-2'>Security</div>
                        <button
                            className={`px-4 py-2 rounded-md text-sm font-medium ${
                                securitySettings.selected_computer_filter === 'all'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                            onClick={() =>
                                setSecuritySettings((prev) => ({
                                    ...prev,
                                    selected_computer_filter: 'all',
                                }))
                            }
                        >
                            All computers
                        </button>
                    </div>
                    <button
                        onClick={() => setShowAddSecurityGroup(true)}
                        className='settings-button-primary rounded-md px-4 py-2 flex items-center space-x-2'
                    >
                        <span>+</span>
                        <span>Add security group</span>
                    </button>
                </div>

                <div className='bg-gray-800 rounded-lg'>
                    <div className='grid grid-cols-2 gap-4 p-3 border-b border-gray-700 text-gray-400 text-sm font-medium'>
                        <div>COMPUTERS LIST</div>
                        <div>GROUP</div>
                    </div>
                    {securitySettings.computers.length === 0 ? (
                        <div className='p-8 text-center text-gray-400'>
                            No computers available
                        </div>
                    ) : (
                        securitySettings.computers.map((computer) => (
                            <div
                                key={computer.id}
                                className={`grid grid-cols-2 gap-4 p-3 border-b border-gray-700 last:border-b-0 text-white text-sm cursor-pointer hover:bg-gray-700 ${
                                    selectedComputer?.id === computer.id ? 'bg-gray-700' : ''
                                }`}
                                onClick={() => setSelectedComputer(computer)}
                            >
                                <div className='truncate'>{computer.name}</div>
                                <div className='truncate text-gray-400'>
                                    {computer.group || 'No group assigned'}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {securitySettings.security_groups.length > 0 && (
                    <div className='mt-6'>
                        <div className='text-lg text-white font-medium mb-4'>Security Groups</div>
                        <div className='bg-gray-800 rounded-lg'>
                            <div className='grid grid-cols-3 gap-4 p-3 border-b border-gray-700 text-gray-400 text-sm font-medium'>
                                <div>NAME</div>
                                <div>SYSTEM SETTINGS</div>
                                <div>ACTIONS</div>
                            </div>
                            {securitySettings.security_groups.map((group) => (
                                <div
                                    key={group.id}
                                    className='grid grid-cols-3 gap-4 p-3 border-b border-gray-700 last:border-b-0 text-white text-sm'
                                >
                                    <div className='truncate'>{group.name}</div>
                                    <div className='truncate text-gray-400'>
                                        {Object.values(group.system_settings).filter(Boolean).length} enabled
                                    </div>
                                    <div>
                                        <button
                                            onClick={() => removeSecurityGroup(group.id)}
                                            className='text-red-400 hover:text-red-300'
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {showAddSecurityGroup && (
                <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
                    <div className='bg-gray-800 rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto'>
                        <div className='flex items-center justify-between mb-6'>
                            <h3 className='text-lg text-white font-medium'>Security policy group</h3>
                            <button
                                onClick={() => setShowAddSecurityGroup(false)}
                                className='text-gray-400 hover:text-white'
                            >
                                ✕
                            </button>
                        </div>

                        <div className='space-y-6'>
                            <div>
                                <label className='block text-white text-sm mb-2'>Name *</label>
                                <input
                                    type='text'
                                    value={newSecurityGroup.name}
                                    onChange={(e) =>
                                        setNewSecurityGroup((prev) => ({ ...prev, name: e.target.value }))
                                    }
                                    className='settings-input w-full'
                                    placeholder='Enter security group name'
                                />
                            </div>

                            <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
                                <div>
                                    <h4 className='text-white font-medium mb-4'>System settings</h4>
                                    <div className='space-y-3'>
                                        {[
                                            { key: 'task_manager', label: 'Task manager' },
                                            { key: 'batch_files', label: 'Batch files' },
                                            { key: 'usb_access', label: 'Usb access' },
                                            { key: 'powershell', label: 'PowerShell' },
                                            { key: 'power_button_action', label: 'Power button action' },
                                        ].map(({ key, label }) => (
                                            <div key={key} className='flex items-center justify-between'>
                                                <span className='text-white text-sm'>{label}</span>
                                                <label className='relative inline-flex items-center cursor-pointer'>
                                                    <input
                                                        type='checkbox'
                                                        checked={newSecurityGroup.system_settings[key]}
                                                        onChange={(e) => updateSystemSetting(key, e.target.checked)}
                                                        className='sr-only peer'
                                                    />
                                                    <div
                                                        className={`w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all ${
                                                            newSecurityGroup.system_settings[key]
                                                                ? 'bg-red-500'
                                                                : 'bg-gray-600'
                                                        }`}
                                                    ></div>
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <h4 className='text-white font-medium mb-4'>Browser settings</h4>
                                    <div className='space-y-3'>
                                        <div>
                                            <label className='block text-white text-sm mb-2'>
                                                Incognito mode
                                            </label>
                                            <select
                                                value={newSecurityGroup.browser_settings.incognito_mode}
                                                onChange={(e) =>
                                                    updateBrowserSetting('incognito_mode', e.target.value)
                                                }
                                                className='settings-input w-full'
                                            >
                                                {incognitoOptions.map((option) => (
                                                    <option key={option} value={option}>
                                                        {option}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        {[
                                            { key: 'file_explorer', label: 'File explorer' },
                                            { key: 'file_download', label: 'File download' },
                                            { key: 'extensions', label: 'Extensions' },
                                        ].map(({ key, label }) => (
                                            <div key={key} className='flex items-center justify-between'>
                                                <span className='text-white text-sm'>{label}</span>
                                                <label className='relative inline-flex items-center cursor-pointer'>
                                                    <input
                                                        type='checkbox'
                                                        checked={newSecurityGroup.browser_settings[key]}
                                                        onChange={(e) => updateBrowserSetting(key, e.target.checked)}
                                                        className='sr-only peer'
                                                    />
                                                    <div
                                                        className={`w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all ${
                                                            newSecurityGroup.browser_settings[key]
                                                                ? 'bg-red-500'
                                                                : 'bg-gray-600'
                                                        }`}
                                                    ></div>
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className='space-y-4'>
                                <div>
                                    <label className='block text-white text-sm mb-2'>Disabled hard drives</label>
                                    <div className='flex flex-wrap gap-2 mb-2'>
                                        {newSecurityGroup.disabled_hard_drives.length === 0 ? (
                                            <span className='text-gray-400 text-sm'>None</span>
                                        ) : (
                                            newSecurityGroup.disabled_hard_drives.map((drive) => (
                                                <span
                                                    key={drive}
                                                    className='bg-gray-700 text-white px-2 py-1 rounded text-sm flex items-center space-x-1'
                                                >
                                                    <span>{drive}</span>
                                                    <button
                                                        onClick={() => removeDisabledDrive(drive)}
                                                        className='text-red-400 hover:text-red-300'
                                                    >
                                                        ✕
                                                    </button>
                                                </span>
                                            ))
                                        )}
                                    </div>
                                    <div className='flex space-x-2'>
                                        <input
                                            type='text'
                                            placeholder='Enter drive letter (e.g., D:)'
                                            className='settings-input flex-1'
                                            onKeyPress={(e) => {
                                                if (e.key === 'Enter') {
                                                    addDisabledDrive(e.target.value);
                                                    e.target.value = '';
                                                }
                                            }}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className='block text-white text-sm mb-2'>
                                        Blocked applications
                                    </label>
                                    <div className='flex flex-wrap gap-2 mb-2'>
                                        {newSecurityGroup.blocked_applications.map((app) => (
                                            <span
                                                key={app}
                                                className='bg-gray-700 text-white px-2 py-1 rounded text-sm flex items-center space-x-1'
                                            >
                                                <span>{app}</span>
                                                <button
                                                    onClick={() => removeBlockedApplication(app)}
                                                    className='text-red-400 hover:text-red-300'
                                                >
                                                    ✕
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                    <input
                                        type='text'
                                        placeholder='Enter application name'
                                        className='settings-input w-full'
                                        onKeyPress={(e) => {
                                            if (e.key === 'Enter') {
                                                addBlockedApplication(e.target.value);
                                                e.target.value = '';
                                            }
                                        }}
                                    />
                                </div>

                                <div>
                                    <label className='block text-white text-sm mb-2'>URL blacklist</label>
                                    <div className='flex flex-wrap gap-2 mb-2'>
                                        {newSecurityGroup.url_blacklist.map((url) => (
                                            <span
                                                key={url}
                                                className='bg-gray-700 text-white px-2 py-1 rounded text-sm flex items-center space-x-1'
                                            >
                                                <span>{url}</span>
                                                <button
                                                    onClick={() => removeUrlFromBlacklist(url)}
                                                    className='text-red-400 hover:text-red-300'
                                                >
                                                    ✕
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                    <input
                                        type='text'
                                        placeholder='Enter URL to block'
                                        className='settings-input w-full'
                                        onKeyPress={(e) => {
                                            if (e.key === 'Enter') {
                                                addUrlToBlacklist(e.target.value);
                                                e.target.value = '';
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className='flex space-x-3 mt-6'>
                            <button
                                onClick={() => setShowAddSecurityGroup(false)}
                                className='settings-button rounded-md px-4 py-2 flex-1'
                            >
                                Cancel
                            </button>
                            <button
                                onClick={addSecurityGroup}
                                className='settings-button-primary rounded-md px-4 py-2 flex-1'
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

export default ClientSecurity;
