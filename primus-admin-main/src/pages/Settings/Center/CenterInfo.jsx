import React, { useState, useEffect } from 'react';
import { showToast } from '../../../utils/api';
import { settingsAPI, settingsToObject, objectToSettings } from '../../../utils/settings.js';

function Field({ label, children }) {
    return <div className='mb-3'><div className='text-gray-300 text-sm mb-1'>{label}</div>{children}</div>;
}

function CenterInfo() {
    const [centerInfoSettings, setCenterInfoSettings] = useState({
        // Center information
        logo_url: '',
        address: '',
        email: '',
        phone: '',
        discord_link: '',

        // Social media
        facebook_username: '',
        instagram_username: '',
        twitter_url: '',
        youtube_channel_url: '',
        twitch_url: '',

        // Working hours (placeholder for future implementation)
        working_hours: [],
        special_schedule: []
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadCenterInfoSettings();
    }, []);

    const loadCenterInfoSettings = async () => {
        try {
            const settings = await settingsAPI.getSettingsByCategory('center_info');
            const settingsObj = settingsToObject(settings);

            setCenterInfoSettings(prev => ({
                ...prev,
                ...settingsObj
            }));
        } catch (error) {
            showToast('Failed to load center info settings', 'error');
        } finally {
            setLoading(false);
        }
    };

    const saveCenterInfoSettings = async () => {
        setSaving(true);
        try {
            const settingsToUpdate = objectToSettings(centerInfoSettings, 'center_info');
            await settingsAPI.bulkUpdateSettings(settingsToUpdate);
            showToast('Center info settings saved successfully', 'success');
        } catch (error) {
            showToast('Failed to save center info settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    const updateSetting = (key, value) => {
        setCenterInfoSettings(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const handleLogoUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            // In a real implementation, you'd upload the file to a server
            // For now, we'll just create a data URL
            const reader = new FileReader();
            reader.onload = (e) => {
                updateSetting('logo_url', e.target.result);
            };
            reader.readAsDataURL(file);
        }
    };

    if (loading) {
        return (
            <div className='text-xl text-white font-semibold mb-4'>
                Center/Center configuration
                <div className='text-gray-400 text-sm mt-2'>Loading settings...</div>
            </div>
        );
    }

    return (
        <div>
            <div className='text-xl text-white font-semibold mb-4'>Center/Center configuration</div>
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
                <div className='card-animated p-4'>
                    <div className='text-gray-400 text-sm mb-2'>Center information</div>
                    <div className='grid grid-cols-1 gap-3'>
                        <div className='border border-white/10 rounded-md p-8 text-gray-400 text-center relative'>
                            {centerInfoSettings.logo_url ? (
                                <img
                                    src={centerInfoSettings.logo_url}
                                    alt='Center Logo'
                                    className='max-w-full max-h-32 object-contain mx-auto mb-2'
                                />
                            ) : (
                                <div className='mb-2'>No logo uploaded</div>
                            )}
                            <input
                                type='file'
                                accept='image/*'
                                onChange={handleLogoUpload}
                                className='absolute inset-0 w-full h-full opacity-0 cursor-pointer'
                            />
                            <div className='text-xs'>Click to upload Logo (390×270px)</div>
                        </div>
                        <Field label='Address'>
                            <input
                                className='search-input w-full rounded-md px-3 py-2'
                                value={centerInfoSettings.address}
                                onChange={(e) => updateSetting('address', e.target.value)}
                            />
                        </Field>
                        <Field label='Email'>
                            <input
                                className='search-input w-full rounded-md px-3 py-2'
                                type='email'
                                value={centerInfoSettings.email}
                                onChange={(e) => updateSetting('email', e.target.value)}
                            />
                        </Field>
                        <Field label='Phone'>
                            <input
                                className='search-input w-full rounded-md px-3 py-2'
                                type='tel'
                                value={centerInfoSettings.phone}
                                onChange={(e) => updateSetting('phone', e.target.value)}
                            />
                        </Field>
                        <Field label='Discord link'>
                            <input
                                className='search-input w-full rounded-md px-3 py-2'
                                type='url'
                                value={centerInfoSettings.discord_link}
                                onChange={(e) => updateSetting('discord_link', e.target.value)}
                            />
                        </Field>
                    </div>
                </div>
                <div className='card-animated p-4'>
                    <div className='text-gray-400 text-sm mb-2'>Social media</div>
                    <div className='grid grid-cols-1 gap-3'>
                        <Field label='Facebook username'>
                            <input
                                className='search-input w-full rounded-md px-3 py-2'
                                value={centerInfoSettings.facebook_username}
                                onChange={(e) => updateSetting('facebook_username', e.target.value)}
                            />
                        </Field>
                        <Field label='Instagram username'>
                            <input
                                className='search-input w-full rounded-md px-3 py-2'
                                value={centerInfoSettings.instagram_username}
                                onChange={(e) => updateSetting('instagram_username', e.target.value)}
                            />
                        </Field>
                        <Field label='Twitter url'>
                            <input
                                className='search-input w-full rounded-md px-3 py-2'
                                type='url'
                                value={centerInfoSettings.twitter_url}
                                onChange={(e) => updateSetting('twitter_url', e.target.value)}
                            />
                        </Field>
                        <Field label='Youtube channel url'>
                            <input
                                className='search-input w-full rounded-md px-3 py-2'
                                type='url'
                                value={centerInfoSettings.youtube_channel_url}
                                onChange={(e) => updateSetting('youtube_channel_url', e.target.value)}
                            />
                        </Field>
                        <Field label='Twitch url'>
                            <input
                                className='search-input w-full rounded-md px-3 py-2'
                                type='url'
                                value={centerInfoSettings.twitch_url}
                                onChange={(e) => updateSetting('twitch_url', e.target.value)}
                            />
                        </Field>
                    </div>
                </div>
            </div>
            <div className='grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4'>
                <div className='card-animated h-64 flex items-center justify-center'>
                    <div className='text-gray-400 text-center'>
                        <div className='text-sm mb-2'>Working hours configuration</div>
                        <div className='text-xs'>Coming soon...</div>
                    </div>
                </div>
                <div className='card-animated p-4 text-gray-300'>
                    <div className='text-sm font-medium mb-2'>Working hours</div>
                    <div className='text-xs text-gray-400'>Monday - Friday: 9:00 AM - 11:00 PM</div>
                    <div className='text-xs text-gray-400'>Saturday - Sunday: 8:00 AM - 12:00 AM</div>
                </div>
                <div className='card-animated p-4 text-gray-300'>
                    <div className='text-sm font-medium mb-2'>Special schedule</div>
                    <div className='text-xs text-gray-400'>No special schedules configured</div>
                </div>
            </div>
            <div className='mt-6'>
                <button
                    className='pill'
                    onClick={saveCenterInfoSettings}
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Save changes'}
                </button>
            </div>
        </div>
    );
}

export default CenterInfo;
