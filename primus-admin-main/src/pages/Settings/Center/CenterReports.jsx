import React, { useState, useEffect } from 'react';
import { showToast } from '../../../utils/api';
import { settingsAPI, settingsToObject, objectToSettings } from '../../../utils/settings.js';

function Field({ label, children }) {
    return <div className='mb-3'><div className='text-gray-300 text-sm mb-1'>{label}</div>{children}</div>;
}

function CenterReports() {
    const [reportsSettings, setReportsSettings] = useState({
        start_of_day: '8:00 am',
        start_of_week: 'Sunday',
        ignore_data_before: '',
        shift_mode: 'None',
        reporting_emails: []
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [newEmail, setNewEmail] = useState('');

    useEffect(() => {
        loadReportsSettings();
    }, []);

    const loadReportsSettings = async () => {
        try {
            const settings = await settingsAPI.getSettingsByCategory('reports');
            const settingsObj = settingsToObject(settings);

            // Handle email list separately as it's stored as JSON
            const emails = settingsObj.reporting_emails || [];
            delete settingsObj.reporting_emails;

            setReportsSettings(prev => ({
                ...prev,
                ...settingsObj,
                reporting_emails: Array.isArray(emails) ? emails : []
            }));
        } catch (error) {
            showToast('Failed to load reports settings', 'error');
        } finally {
            setLoading(false);
        }
    };

    const saveReportsSettings = async () => {
        setSaving(true);
        try {
            const settingsToUpdate = objectToSettings(reportsSettings, 'reports');
            await settingsAPI.bulkUpdateSettings(settingsToUpdate);
            showToast('Reports settings saved successfully', 'success');
        } catch (error) {
            showToast('Failed to save reports settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    const updateSetting = (key, value) => {
        setReportsSettings(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const addEmail = () => {
        if (newEmail && !reportsSettings.reporting_emails.includes(newEmail)) {
            const updatedEmails = [...reportsSettings.reporting_emails, newEmail];
            updateSetting('reporting_emails', updatedEmails);
            setNewEmail('');
        }
    };

    const removeEmail = (emailToRemove) => {
        const updatedEmails = reportsSettings.reporting_emails.filter(email => email !== emailToRemove);
        updateSetting('reporting_emails', updatedEmails);
    };

    if (loading) {
        return (
            <div className='text-xl text-white font-semibold mb-4'>
                Center/Reports
                <div className='text-gray-400 text-sm mt-2'>Loading settings...</div>
            </div>
        );
    }

    return (
        <div>
            <div className='text-xl text-white font-semibold mb-4'>Center/Reports</div>
            <div className='card-animated p-4'>
                <div className='grid grid-cols-1 lg:grid-cols-3 gap-3'>
                    <Field label='Start of day'>
                        <input
                            className='search-input w-full rounded-md px-3 py-2'
                            type='time'
                            value={reportsSettings.start_of_day}
                            onChange={(e) => updateSetting('start_of_day', e.target.value)}
                        />
                    </Field>
                    <Field label='Start of the week'>
                        <select
                            className='search-input rounded-md px-3 py-2'
                            value={reportsSettings.start_of_week}
                            onChange={(e) => updateSetting('start_of_week', e.target.value)}
                        >
                            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
                                <option key={day} value={day}>{day}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label='Ignore all data before'>
                        <input
                            className='search-input w-full rounded-md px-3 py-2'
                            type='date'
                            value={reportsSettings.ignore_data_before}
                            onChange={(e) => updateSetting('ignore_data_before', e.target.value)}
                        />
                    </Field>
                </div>
                <div className='mt-4'>
                    <div className='text-gray-300 text-sm mb-2'>Shift mode</div>
                    <div className='flex gap-6 text-gray-300'>
                        {['None', 'Normal', 'Strict'].map(mode => (
                            <label key={mode} className='pill'>
                                <input
                                    type='radio'
                                    name='shift'
                                    className='mr-2'
                                    checked={reportsSettings.shift_mode === mode}
                                    onChange={() => updateSetting('shift_mode', mode)}
                                />
                                {mode}
                            </label>
                        ))}
                    </div>
                </div>
                <div className='mt-6'>
                    <Field label='Reporting mailing list'>
                        <div className='flex gap-2'>
                            <input
                                className='search-input flex-1 rounded-md px-3 py-2'
                                placeholder='Enter email address'
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && addEmail()}
                            />
                            <button className='pill' onClick={addEmail}>Add email</button>
                        </div>
                    </Field>
                    {reportsSettings.reporting_emails.length > 0 && (
                        <div className='mt-3'>
                            <div className='text-gray-400 text-sm mb-2'>Current emails:</div>
                            <div className='flex flex-wrap gap-2'>
                                {reportsSettings.reporting_emails.map(email => (
                                    <div key={email} className='pill inline-flex items-center gap-2'>
                                        {email}
                                        <button
                                            className='text-red-400 hover:text-red-300'
                                            onClick={() => removeEmail(email)}
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <button
                    className='pill mt-4'
                    onClick={saveReportsSettings}
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Save changes'}
                </button>
            </div>
        </div>
    );
}

export default CenterReports;
