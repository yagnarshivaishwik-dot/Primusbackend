import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { getApiBase, authHeaders, showToast } from '../../../utils/api';
import { settingsAPI, settingsToObject, objectToSettings } from '../../../utils/settings.js';

function ClientGeneral() {
    const [generalSettings, setGeneralSettings] = useState({
        pc_idle_timeout_hours: 0,
        pc_idle_timeout_minutes: 0,
        pc_idle_timeout_seconds: 0,
        gdpr_enabled: false,
        gdpr_age_level: 16,
        profile_access_enabled: true,
        profile_general_info: true,
        profile_see_offers: true,
        profile_edit_credentials: true,
        logout_action: 'do_nothing',
        hide_home_screen: false,
        enable_events: true,
        clock_enabled: false,
        allow_force_logout: true,
        default_login: true,
        manual_account_creation: true,
        free_time_assigned: false,
        free_time_days: 0,
        free_time_hours: 1,
        free_time_minutes: 0,
        persistent_lock: true
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadClientGeneralSettings();
    }, []);

    const loadClientGeneralSettings = async () => {
        try {
            let settings = await settingsAPI.getSettingsByCategory('client_general');

            // If no settings exist, initialize defaults
            if (!settings || settings.length === 0) {
                try {
                    const base = getApiBase().replace(/\/$/, '');
                    const response = await fetch(`${base}/api/settings/initialize-defaults`, {
                        method: 'POST',
                        headers: authHeaders()
                    });
                    if (response.ok) {
                        showToast('Default settings initialized');
                        // Reload settings after initialization
                        settings = await settingsAPI.getSettingsByCategory('client_general');
                    }
                } catch (initError) {
                    // Could not initialize defaults (might not have permissions)
                }
            }

            const settingsObj = settingsToObject(settings);
            setGeneralSettings(prev => ({ ...prev, ...settingsObj }));
        } catch (error) {
            showToast('Failed to load client general settings');
        } finally {
            setLoading(false);
        }
    };

    const updateSetting = (key, value) => {
        // Ensure numeric values are properly typed
        if (key.includes('timeout_') && ['hours', 'minutes', 'seconds'].some(t => key.includes(t))) {
            value = parseInt(value) || 0;
        } else if (key.includes('free_time_') && ['days', 'hours', 'minutes'].some(t => key.includes(t))) {
            value = parseInt(value) || 0;
        } else if (key === 'gdpr_age_level') {
            value = parseInt(value) || 16;
        }

        setGeneralSettings(prev => ({ ...prev, [key]: value }));
    };

    const saveClientGeneralSettings = async () => {
        setSaving(true);
        try {
            const settingsArray = objectToSettings(generalSettings, 'client_general');

            // Add descriptions for better debugging
            const settingsWithDescriptions = settingsArray.map(setting => ({
                ...setting,
                description: setting.description || `Client general setting: ${setting.key}`
            }));

            // Validate timeout values
            const totalSeconds = (generalSettings.pc_idle_timeout_hours * 3600) +
                (generalSettings.pc_idle_timeout_minutes * 60) +
                generalSettings.pc_idle_timeout_seconds;

            if (totalSeconds > 86400) { // 24 hours max
                showToast('PC idle timeout cannot exceed 24 hours');
                setSaving(false);
                return;
            }

            // Validate free time values
            if (generalSettings.free_time_assigned) {
                const totalFreeTime = (generalSettings.free_time_days * 86400) +
                    (generalSettings.free_time_hours * 3600) +
                    (generalSettings.free_time_minutes * 60);

                if (totalFreeTime === 0) {
                    showToast('Please specify at least some free time when enabled');
                    setSaving(false);
                    return;
                }

                if (totalFreeTime > 2592000) { // 30 days max
                    showToast('Free time cannot exceed 30 days');
                    setSaving(false);
                    return;
                }
            }

            await settingsAPI.bulkUpdateSettings(settingsWithDescriptions);
            showToast('Client general settings saved successfully');
        } catch (error) {
            showToast('Failed to save client general settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="text-xl text-white font-semibold mb-4">
                Client/General settings
                <div className="text-gray-400 text-sm mt-2">Loading settings...</div>
            </div>
        );
    }

    return (
        <div>
            <div className="text-xl text-white font-semibold mb-4">Client/General settings</div>

            {/* PC Idle timeout */}
            <div className="settings-card p-4 mb-4">
                <div className="text-lg text-white font-medium mb-2">PC Idle timeout</div>
                <div className="text-gray-400 text-sm mb-4">Choose if a pc should automatically turn off after a period of being idle (without a user logged in)</div>
                <div className="grid grid-cols-3 gap-4">
                    <Field label="Hours">
                        <select className="search-input w-full rounded-md px-3 py-2" value={generalSettings.pc_idle_timeout_hours} onChange={e => updateSetting('pc_idle_timeout_hours', parseInt(e.target.value))}>
                            {[...Array(24)].map((_, i) => <option key={i} value={i}>{i}</option>)}
                        </select>
                    </Field>
                    <Field label="Minutes">
                        <select className="search-input w-full rounded-md px-3 py-2" value={generalSettings.pc_idle_timeout_minutes} onChange={e => updateSetting('pc_idle_timeout_minutes', parseInt(e.target.value))}>
                            {[...Array(60)].map((_, i) => <option key={i} value={i}>{i}</option>)}
                        </select>
                    </Field>
                    <Field label="Seconds">
                        <select className="search-input w-full rounded-md px-3 py-2" value={generalSettings.pc_idle_timeout_seconds} onChange={e => updateSetting('pc_idle_timeout_seconds', parseInt(e.target.value))}>
                            {[...Array(60)].map((_, i) => <option key={i} value={i}>{i}</option>)}
                        </select>
                    </Field>
                </div>
            </div>

            {/* GDPR */}
            <div className="settings-card p-4 mb-4">
                <div className="text-lg text-white font-medium mb-2">Current GDPR</div>
                <div className="flex items-center space-x-3 mb-4">
                    <Toggle value={generalSettings.gdpr_enabled} onChange={value => updateSetting('gdpr_enabled', value)} />
                    <span className="text-white">GDPR</span>
                </div>

                {generalSettings.gdpr_enabled && (
                    <div>
                        <div className="text-white mb-2">GDPR age level</div>
                        <div className="flex space-x-4">
                            {[13, 14, 15, 16].map(age => (
                                <label key={age} className="flex items-center space-x-2 text-white">
                                    <input
                                        type="radio"
                                        name="gdpr_age"
                                        value={age}
                                        checked={generalSettings.gdpr_age_level === age}
                                        onChange={() => updateSetting('gdpr_age_level', age)}
                                        className="text-purple-500"
                                    />
                                    <span>{age}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Profile access */}
            <div className="settings-card p-4 mb-4">
                <div className="text-lg text-white font-medium mb-2">Profile access</div>
                <div className="flex items-center space-x-3 mb-4">
                    <Toggle value={generalSettings.profile_access_enabled} onChange={value => updateSetting('profile_access_enabled', value)} />
                    <span className="text-white">Allow profile access to the users</span>
                </div>

                {generalSettings.profile_access_enabled && (
                    <div className="space-y-3">
                        <div className="flex items-center space-x-3">
                            <Toggle value={generalSettings.profile_general_info} onChange={value => updateSetting('profile_general_info', value)} />
                            <span className="text-white">General information</span>
                        </div>
                        <div className="flex items-center space-x-3">
                            <Toggle value={generalSettings.profile_see_offers} onChange={value => updateSetting('profile_see_offers', value)} />
                            <span className="text-white">See offers</span>
                        </div>
                        <div className="flex items-center space-x-3">
                            <Toggle value={generalSettings.profile_edit_credentials} onChange={value => updateSetting('profile_edit_credentials', value)} />
                            <span className="text-white">Edit credentials</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Client logout button action */}
            <div className="settings-card p-4 mb-4">
                <div className="text-lg text-white font-medium mb-2">Client logout button action</div>
                <div className="space-y-2">
                    {[
                        { value: 'do_nothing', label: 'Do nothing' },
                        { value: 'windows_logout', label: 'Windows logout' },
                        { value: 'reboot_pc', label: 'Reboot PC' },
                        { value: 'turn_off_pc', label: 'Turn off PC' },
                        { value: 'lock_pc', label: 'Lock PC' }
                    ].map(option => (
                        <label key={option.value} className="flex items-center space-x-2 text-white">
                            <input
                                type="radio"
                                name="logout_action"
                                value={option.value}
                                checked={generalSettings.logout_action === option.value}
                                onChange={() => updateSetting('logout_action', option.value)}
                                className="text-purple-500"
                            />
                            <span>{option.label}</span>
                        </label>
                    ))}
                </div>
            </div>

            {/* Additional toggles */}
            <div className="settings-card p-4 mb-4">
                <div className="space-y-4">
                    <div>
                        <div className="text-lg text-white font-medium mb-2">Hide home screen</div>
                        <div className="text-gray-400 text-sm mb-2">Users will directly go to Games screen right after login, and hides the home screen.</div>
                        <div className="flex items-center space-x-3">
                            <Toggle value={generalSettings.hide_home_screen} onChange={value => updateSetting('hide_home_screen', value)} />
                            <span className="text-white">Hide home screen</span>
                        </div>
                    </div>

                    <div>
                        <div className="text-lg text-white font-medium mb-2">Enable events</div>
                        <div className="text-gray-400 text-sm mb-2">Enable or disable Arcade events for your center.</div>
                        <div className="flex items-center space-x-3">
                            <Toggle value={generalSettings.enable_events} onChange={value => updateSetting('enable_events', value)} />
                            <span className="text-white">Enable events</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Other settings */}
            <div className="settings-card p-4 mb-4">
                <div className="text-lg text-white font-medium mb-3">Other settings</div>
                <div className="space-y-4">
                    <div className="flex items-center space-x-3">
                        <input
                            type="checkbox"
                            checked={generalSettings.clock_enabled}
                            onChange={e => updateSetting('clock_enabled', e.target.checked)}
                            className="w-4 h-4"
                        />
                        <span className="text-white">Clock enabled</span>
                    </div>
                    <div className="flex items-center space-x-3">
                        <input
                            type="checkbox"
                            checked={generalSettings.allow_force_logout}
                            onChange={e => updateSetting('allow_force_logout', e.target.checked)}
                            className="w-4 h-4"
                        />
                        <span className="text-white">Allow force logout</span>
                    </div>
                </div>
            </div>

            {/* Login method */}
            <div className="settings-card p-4 mb-4">
                <div className="text-lg text-white font-medium mb-2">Login method</div>
                <div className="text-gray-400 text-sm mb-3">Select the methods the user will be able to use to log in to the client. You can find the rest of the methods created as add-ons in the &apos;Add-Ons Marketplace&apos; section.</div>
                <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                        <Toggle value={generalSettings.default_login} onChange={value => updateSetting('default_login', value)} />
                        <span className="text-white">Default login</span>
                    </div>
                    <div className="flex items-center space-x-3">
                        <Toggle value={generalSettings.manual_account_creation} onChange={value => updateSetting('manual_account_creation', value)} />
                        <span className="text-white">Manual account creation at PC</span>
                    </div>
                </div>
            </div>

            {/* Free time assigned */}
            <div className="settings-card p-4 mb-4">
                <div className="text-lg text-white font-medium mb-2">Free time assigned to account</div>
                <div className="text-gray-400 text-sm mb-4">Automatically award every new customer who registers at the gaming pc, with an amount of initial free gaming time (e.g first hour is free!)</div>
                <div className="flex items-center space-x-3 mb-4">
                    <Toggle value={generalSettings.free_time_assigned} onChange={value => updateSetting('free_time_assigned', value)} />
                    <span className="text-white">Free time assigned to account</span>
                </div>

                {generalSettings.free_time_assigned && (
                    <div className="grid grid-cols-3 gap-4 mt-4">
                        <Field label="Free days">
                            <select
                                className="search-input w-full rounded-md px-3 py-2"
                                value={generalSettings.free_time_days}
                                onChange={e => updateSetting('free_time_days', parseInt(e.target.value))}
                            >
                                {[...Array(31)].map((_, i) => <option key={i} value={i}>{i}</option>)}
                            </select>
                        </Field>
                        <Field label="Free hours">
                            <select
                                className="search-input w-full rounded-md px-3 py-2"
                                value={generalSettings.free_time_hours}
                                onChange={e => updateSetting('free_time_hours', parseInt(e.target.value))}
                            >
                                {[...Array(24)].map((_, i) => <option key={i} value={i}>{i}</option>)}
                            </select>
                        </Field>
                        <Field label="Free minutes">
                            <select
                                className="search-input w-full rounded-md px-3 py-2"
                                value={generalSettings.free_time_minutes}
                                onChange={e => updateSetting('free_time_minutes', parseInt(e.target.value))}
                            >
                                {[...Array(60)].map((_, i) => <option key={i} value={i}>{i}</option>)}
                            </select>
                        </Field>
                    </div>
                )}
            </div>

            {/* Persistent lock */}
            <div className="settings-card p-4 mb-6">
                <div className="text-lg text-white font-medium mb-2">Persistent lock</div>
                <div className="flex items-center space-x-3">
                    <Toggle value={generalSettings.persistent_lock} onChange={value => updateSetting('persistent_lock', value)} />
                    <span className="text-white">Keep PC locked after reboot</span>
                </div>
            </div>

            {/* Save button */}
            <div className="mt-6">
                <button
                    className="settings-button-primary rounded-md px-4 py-2"
                    onClick={saveClientGeneralSettings}
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Save changes'}
                </button>
            </div>
        </div>
    );
}

// Local layout helpers (kept inline to avoid coupling with the Center settings tree
// extraction which is owned by a parallel agent).
function Field({ label, children }) {
    return <div className="mb-3"><div className="text-gray-300 text-sm mb-1">{label}</div>{children}</div>;
}

Field.propTypes = {
    label: PropTypes.string.isRequired,
    children: PropTypes.node
};

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

export default ClientGeneral;
