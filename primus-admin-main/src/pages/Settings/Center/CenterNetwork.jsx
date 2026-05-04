import React, { useState, useEffect } from 'react';
import { showToast } from '../../../utils/api';
import { settingsAPI, settingsToObject, objectToSettings } from '../../../utils/settings.js';

function Field({ label, children }) {
    return <div className='mb-3'><div className='text-gray-300 text-sm mb-1'>{label}</div>{children}</div>;
}

function Toggle({ label, value, onChange }) {
    const handleToggle = () => {
        if (onChange) {
            onChange(!value);
        }
    };

    return <div className='flex items-center justify-between bg-white/5 p-3 rounded-md mb-2'>
        <div className='text-gray-300'>{label}</div>
        <button className={`w-10 h-6 rounded-full ${value ? 'bg-primary' : 'bg-gray-600'}`} onClick={handleToggle}><span className={`block w-5 h-5 bg-white rounded-full transform transition ${value ? 'translate-x-5' : 'translate-x-0'}`}></span></button>
    </div>;
}

function CenterNetwork() {
    const [networkSettings, setNetworkSettings] = useState({
        owner_email: '',
        network_status: 'not_joined', // not_joined, pending, joined
        network_id: '',
        shared_resources: false,
        data_sync: false,
        remote_support: false
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [joiningNetwork, setJoiningNetwork] = useState(false);

    useEffect(() => {
        loadNetworkSettings();
    }, []);

    const loadNetworkSettings = async () => {
        try {
            const settings = await settingsAPI.getSettingsByCategory('center_network');
            const settingsObj = settingsToObject(settings);

            setNetworkSettings(prev => ({
                ...prev,
                ...settingsObj
            }));
        } catch (error) {
            showToast('Failed to load network settings', 'error');
        } finally {
            setLoading(false);
        }
    };

    const saveNetworkSettings = async () => {
        setSaving(true);
        try {
            const settingsToUpdate = objectToSettings(networkSettings, 'center_network');
            await settingsAPI.bulkUpdateSettings(settingsToUpdate);
            showToast('Network settings saved successfully', 'success');
        } catch (error) {
            showToast('Failed to save network settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    const updateSetting = (key, value) => {
        setNetworkSettings(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const joinNetwork = async () => {
        if (!networkSettings.owner_email) {
            showToast('Please enter owner email first', 'error');
            return;
        }

        setJoiningNetwork(true);
        try {
            // In a real implementation, this would make an API call to join the network
            updateSetting('network_status', 'pending');
            await saveNetworkSettings();
            showToast('Network join request sent. Awaiting approval.', 'success');
        } catch (error) {
            showToast('Failed to join network', 'error');
        } finally {
            setJoiningNetwork(false);
        }
    };

    const leaveNetwork = async () => {
        try {
            updateSetting('network_status', 'not_joined');
            updateSetting('network_id', '');
            await saveNetworkSettings();
            showToast('Successfully left the network', 'success');
        } catch (error) {
            showToast('Failed to leave network', 'error');
        }
    };

    if (loading) {
        return (
            <div className='text-xl text-white font-semibold mb-4'>
                Center/Center network
                <div className='text-gray-400 text-sm mt-2'>Loading settings...</div>
            </div>
        );
    }

    const getStatusColor = (status) => {
        switch (status) {
            case 'joined': return 'text-green-400';
            case 'pending': return 'text-yellow-400';
            default: return 'text-gray-400';
        }
    };

    const getStatusText = (status) => {
        switch (status) {
            case 'joined': return 'Connected to network';
            case 'pending': return 'Join request pending approval';
            default: return 'Not connected to network';
        }
    };

    return (
        <div>
            <div className='text-xl text-white font-semibold mb-4'>Center/Center network</div>

            {/* Network Status */}
            <div className='card-animated p-4 mb-4'>
                <div className='flex items-center justify-between'>
                    <div>
                        <div className='text-gray-300 text-sm mb-1'>Network Status</div>
                        <div className={`text-sm ${getStatusColor(networkSettings.network_status)}`}>
                            {getStatusText(networkSettings.network_status)}
                        </div>
                        {networkSettings.network_id && (
                            <div className='text-xs text-gray-500 mt-1'>
                                Network ID: {networkSettings.network_id}
                            </div>
                        )}
                    </div>
                    <div className='flex gap-2'>
                        {networkSettings.network_status === 'not_joined' && (
                            <button
                                className='pill'
                                onClick={joinNetwork}
                                disabled={joiningNetwork || !networkSettings.owner_email}
                            >
                                {joiningNetwork ? 'Joining...' : 'Join Network'}
                            </button>
                        )}
                        {networkSettings.network_status === 'joined' && (
                            <button
                                className='pill bg-red-600 hover:bg-red-700'
                                onClick={leaveNetwork}
                            >
                                Leave Network
                            </button>
                        )}
                        {networkSettings.network_status === 'pending' && (
                            <button
                                className='pill bg-gray-600'
                                disabled
                            >
                                Pending Approval
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Network Configuration */}
            <div className='card-animated p-4 mb-4'>
                <div className='text-gray-400 text-sm mb-2'>Network Configuration</div>
                <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
                    <div>
                        <Field label='Owner Email'>
                            <input
                                className='search-input w-full rounded-md px-3 py-2'
                                type='email'
                                value={networkSettings.owner_email}
                                onChange={(e) => updateSetting('owner_email', e.target.value)}
                                placeholder='Enter owner email to join network'
                            />
                        </Field>
                        <div className='text-xs text-gray-500 mt-1'>
                            Required to join the PRIMUS network
                        </div>
                    </div>
                    <div>
                        <Field label='Network Features'>
                            <div className='space-y-2'>
                                <Toggle
                                    label='Shared Resources'
                                    value={networkSettings.shared_resources}
                                    onChange={(value) => updateSetting('shared_resources', value)}
                                />
                                <Toggle
                                    label='Data Synchronization'
                                    value={networkSettings.data_sync}
                                    onChange={(value) => updateSetting('data_sync', value)}
                                />
                                <Toggle
                                    label='Remote Support'
                                    value={networkSettings.remote_support}
                                    onChange={(value) => updateSetting('remote_support', value)}
                                />
                            </div>
                        </Field>
                    </div>
                </div>
            </div>

            {/* Network Benefits */}
            <div className='card-animated p-4'>
                <div className='text-gray-400 text-sm mb-2'>Network Benefits</div>
                <div className='grid grid-cols-1 lg:grid-cols-3 gap-4'>
                    <div className='text-center'>
                        <div className='text-2xl mb-2'>📊</div>
                        <div className='text-white text-sm font-medium'>Shared Analytics</div>
                        <div className='text-xs text-gray-400 mt-1'>
                            Access network-wide performance data
                        </div>
                    </div>
                    <div className='text-center'>
                        <div className='text-2xl mb-2'>🔧</div>
                        <div className='text-white text-sm font-medium'>Remote Support</div>
                        <div className='text-xs text-gray-400 mt-1'>
                            Get help from network administrators
                        </div>
                    </div>
                    <div className='text-center'>
                        <div className='text-2xl mb-2'>📈</div>
                        <div className='text-white text-sm font-medium'>Performance Insights</div>
                        <div className='text-xs text-gray-400 mt-1'>
                            Benchmark against other centers
                        </div>
                    </div>
                </div>
            </div>

            <div className='mt-6'>
                <button
                    className='pill'
                    onClick={saveNetworkSettings}
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Save changes'}
                </button>
            </div>
        </div>
    );
}

export default CenterNetwork;
