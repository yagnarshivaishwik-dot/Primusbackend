import React, { useState, useEffect } from 'react';
import { showToast } from '../../utils/api';
import { settingsAPI, settingsToObject, objectToSettings } from '../../utils/settings.js';

function UserDetails() {
    const [userFieldSettings, setUserFieldSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const fieldDefinitions = [
        {
            key: 'username',
            label: 'Username',
            type: 'text',
            defaultAdmin: { visible: true, required: true },
            defaultClient: { visible: true, required: true }
        },
        {
            key: 'password',
            label: 'Password',
            type: 'password',
            defaultAdmin: { visible: true, required: true },
            defaultClient: { visible: true, required: true }
        },
        {
            key: 'email',
            label: 'Email',
            type: 'email',
            defaultAdmin: { visible: true, required: true },
            defaultClient: { visible: true, required: true }
        },
        {
            key: 'profile_photo',
            label: 'Profile Photo',
            type: 'file',
            defaultAdmin: { visible: true, required: false },
            defaultClient: { visible: true, required: false }
        },
        {
            key: 'user_group',
            label: 'User Group',
            type: 'select',
            defaultAdmin: { visible: true, required: true },
            defaultClient: { visible: false, required: false }
        },
        {
            key: 'notes',
            label: 'Notes',
            type: 'textarea',
            defaultAdmin: { visible: true, required: false },
            defaultClient: { visible: false, required: false }
        },
        {
            key: 'first_name',
            label: 'First Name',
            type: 'text',
            defaultAdmin: { visible: true, required: false },
            defaultClient: { visible: true, required: false }
        },
        {
            key: 'last_name',
            label: 'Last Name',
            type: 'text',
            defaultAdmin: { visible: true, required: false },
            defaultClient: { visible: true, required: false }
        },
        {
            key: 'date_of_birth',
            label: 'Date of Birth',
            type: 'date',
            defaultAdmin: { visible: true, required: false },
            defaultClient: { visible: true, required: false }
        },
        {
            key: 'phone_number',
            label: 'Phone Number',
            type: 'tel',
            defaultAdmin: { visible: true, required: false },
            defaultClient: { visible: true, required: false }
        },
        {
            key: 'post_pay_limit',
            label: 'Post Pay Limit',
            type: 'number',
            defaultAdmin: { visible: true, required: false },
            defaultClient: { visible: false, required: false }
        }
    ];

    useEffect(() => {
        loadUserFieldSettings();
    }, []);

    const loadUserFieldSettings = async () => {
        try {
            const settings = await settingsAPI.getSettingsByCategory('user_fields');
            const settingsObj = settingsToObject(settings);

            // Initialize with defaults if no settings exist
            const initializedSettings = {};
            fieldDefinitions.forEach(field => {
                const adminKey = `${field.key}_admin`;
                const clientKey = `${field.key}_client`;

                initializedSettings[adminKey] = settingsObj[adminKey] || field.defaultAdmin;
                initializedSettings[clientKey] = settingsObj[clientKey] || field.defaultClient;
            });

            setUserFieldSettings(initializedSettings);
        } catch (error) {
            showToast('Failed to load user field settings', 'error');

            // Initialize with defaults on error
            const defaultSettings = {};
            fieldDefinitions.forEach(field => {
                defaultSettings[`${field.key}_admin`] = field.defaultAdmin;
                defaultSettings[`${field.key}_client`] = field.defaultClient;
            });
            setUserFieldSettings(defaultSettings);
        } finally {
            setLoading(false);
        }
    };

    const saveUserFieldSettings = async () => {
        setSaving(true);
        try {
            const settingsToUpdate = objectToSettings(userFieldSettings, 'user_fields');
            await settingsAPI.bulkUpdateSettings(settingsToUpdate);
            showToast('User field settings saved successfully', 'success');
        } catch (error) {
            showToast('Failed to save user field settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    const updateFieldSetting = (fieldKey, interfaceType, settingType, value) => {
        const key = `${fieldKey}_${interfaceType}`;
        setUserFieldSettings(prev => ({
            ...prev,
            [key]: {
                ...prev[key],
                [settingType]: value
            }
        }));
    };

    const resetToDefaults = () => {
        const defaultSettings = {};
        fieldDefinitions.forEach(field => {
            defaultSettings[`${field.key}_admin`] = field.defaultAdmin;
            defaultSettings[`${field.key}_client`] = field.defaultClient;
        });
        setUserFieldSettings(defaultSettings);
    };

    if (loading) {
        return (
            <div className='text-xl text-white font-semibold mb-4'>
                Center/User details
                <div className='text-gray-400 text-sm mt-2'>Loading settings...</div>
            </div>
        );
    }

    return (
        <div>
            <div className='text-xl text-white font-semibold mb-4'>Center/User details</div>

            <div className='card-animated p-4 mb-4'>
                <div className='flex items-center justify-between mb-4'>
                    <div>
                        <div className='text-gray-300 text-sm'>User Registration Form Configuration</div>
                        <div className='text-gray-500 text-xs mt-1'>
                            Configure which fields appear on user registration and management forms
                        </div>
                    </div>
                    <button
                        className='pill bg-gray-600 hover:bg-gray-500'
                        onClick={resetToDefaults}
                    >
                        Reset to Defaults
                    </button>
                </div>

                <div className='overflow-x-auto'>
                    <table className='w-full'>
                        <thead>
                            <tr className='text-gray-400 text-xs uppercase border-b border-white/10'>
                                <th className='text-left py-2 px-1 w-1/4'>Field Name</th>
                                <th className='text-left py-2 px-1 w-1/6'>Field Type</th>
                                <th className='text-center py-2 px-1 w-1/4'>Web-admin</th>
                                <th className='text-center py-2 px-1 w-1/4'>Client App</th>
                            </tr>
                        </thead>
                        <tbody>
                            {fieldDefinitions.map((field, i) => (
                                <tr key={i} className='border-b border-white/5 hover:bg-white/5'>
                                    <td className='py-3 px-1'>
                                        <div className='text-white font-medium'>{field.label}</div>
                                    </td>
                                    <td className='py-3 px-1'>
                                        <div className='text-gray-400 text-sm'>{field.type}</div>
                                    </td>
                                    <td className='py-3 px-1'>
                                        <div className='flex justify-center gap-2'>
                                            <label className='pill text-xs'>
                                                <input
                                                    type='checkbox'
                                                    className='mr-1'
                                                    checked={userFieldSettings[`${field.key}_admin`]?.visible || false}
                                                    onChange={(e) => updateFieldSetting(field.key, 'admin', 'visible', e.target.checked)}
                                                />
                                                Visible
                                            </label>
                                            <label className='pill text-xs'>
                                                <input
                                                    type='checkbox'
                                                    className='mr-1'
                                                    checked={userFieldSettings[`${field.key}_admin`]?.required || false}
                                                    onChange={(e) => updateFieldSetting(field.key, 'admin', 'required', e.target.checked)}
                                                    disabled={!userFieldSettings[`${field.key}_admin`]?.visible}
                                                />
                                                Required
                                            </label>
                                        </div>
                                    </td>
                                    <td className='py-3 px-1'>
                                        <div className='flex justify-center gap-2'>
                                            <label className='pill text-xs'>
                                                <input
                                                    type='checkbox'
                                                    className='mr-1'
                                                    checked={userFieldSettings[`${field.key}_client`]?.visible || false}
                                                    onChange={(e) => updateFieldSetting(field.key, 'client', 'visible', e.target.checked)}
                                                />
                                                Visible
                                            </label>
                                            <label className='pill text-xs'>
                                                <input
                                                    type='checkbox'
                                                    className='mr-1'
                                                    checked={userFieldSettings[`${field.key}_client`]?.required || false}
                                                    onChange={(e) => updateFieldSetting(field.key, 'client', 'required', e.target.checked)}
                                                    disabled={!userFieldSettings[`${field.key}_client`]?.visible}
                                                />
                                                Required
                                            </label>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Field Requirements Summary */}
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
                <div className='card-animated p-4'>
                    <div className='text-gray-300 text-sm mb-3'>Web-admin Required Fields</div>
                    <div className='space-y-1'>
                        {fieldDefinitions
                            .filter(field => userFieldSettings[`${field.key}_admin`]?.required)
                            .map(field => (
                                <div key={field.key} className='text-white text-sm flex items-center'>
                                    <span className='w-2 h-2 bg-red-500 rounded-full mr-2'></span>
                                    {field.label}
                                </div>
                            ))}
                    </div>
                </div>
                <div className='card-animated p-4'>
                    <div className='text-gray-300 text-sm mb-3'>Client Required Fields</div>
                    <div className='space-y-1'>
                        {fieldDefinitions
                            .filter(field => userFieldSettings[`${field.key}_client`]?.required)
                            .map(field => (
                                <div key={field.key} className='text-white text-sm flex items-center'>
                                    <span className='w-2 h-2 bg-blue-500 rounded-full mr-2'></span>
                                    {field.label}
                                </div>
                            ))}
                    </div>
                </div>
            </div>

            <div className='mt-6'>
                <button
                    className='pill'
                    onClick={saveUserFieldSettings}
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Save changes'}
                </button>
            </div>
        </div>
    );
}

export default UserDetails;
