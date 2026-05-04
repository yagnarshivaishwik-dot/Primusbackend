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

function CenterFinancial() {
    const [financialSettings, setFinancialSettings] = useState({
        // Billing information
        company_name: '',
        tax_number: '',
        decimal_places: 2,
        address: '',

        // Payment methods - web admin
        payment_cash: false,
        payment_credit_card: false,
        payment_account_balance: false,

        // Payment methods - client
        client_account_balance: false,
        client_summon_human: false,
        client_stripe_phone: false,
        client_pay_after_logout: false,

        // Tax rates
        tax_included_in_price: false,
        tax1_name: 'Tax 1',
        tax1_percentage: 0.00,
        tax2_name: 'Tax 2',
        tax2_percentage: 0.00,
        tax3_name: 'Tax 3',
        tax3_percentage: 0.00,

        // Guest pricing
        guest_legacy_prices: 'Price per hour (INR)'
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadFinancialSettings();
    }, []);

    const loadFinancialSettings = async () => {
        try {
            const settings = await settingsAPI.getSettingsByCategory('financial');
            const settingsObj = settingsToObject(settings);

            setFinancialSettings(prev => ({
                ...prev,
                ...settingsObj
            }));
        } catch (error) {
            showToast('Failed to load financial settings', 'error');
        } finally {
            setLoading(false);
        }
    };

    const saveFinancialSettings = async () => {
        setSaving(true);
        try {
            const settingsToUpdate = objectToSettings(financialSettings, 'financial');
            await settingsAPI.bulkUpdateSettings(settingsToUpdate);
            showToast('Financial settings saved successfully', 'success');
        } catch (error) {
            showToast('Failed to save financial settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    const updateSetting = (key, value) => {
        setFinancialSettings(prev => ({
            ...prev,
            [key]: value
        }));
    };

    if (loading) {
        return (
            <div className='text-xl text-white font-semibold mb-4'>
                Center/Financial
                <div className='text-gray-400 text-sm mt-2'>Loading settings...</div>
            </div>
        );
    }

    return (
        <div>
            <div className='text-xl text-white font-semibold mb-4'>Center/Financial</div>
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
                <div className='card-animated p-4'>
                    <div className='text-gray-400 text-sm mb-2'>Billing information</div>
                    <Field label='Company name'>
                        <input
                            className='search-input w-full rounded-md px-3 py-2'
                            value={financialSettings.company_name}
                            onChange={(e) => updateSetting('company_name', e.target.value)}
                        />
                    </Field>
                    <div className='grid grid-cols-2 gap-3'>
                        <Field label='Tax number'>
                            <input
                                className='search-input w-full rounded-md px-3 py-2'
                                value={financialSettings.tax_number}
                                onChange={(e) => updateSetting('tax_number', e.target.value)}
                            />
                        </Field>
                        <Field label='Decimal places'>
                            <input
                                className='search-input w-full rounded-md px-3 py-2'
                                type='number'
                                value={financialSettings.decimal_places}
                                onChange={(e) => updateSetting('decimal_places', parseInt(e.target.value) || 2)}
                            />
                        </Field>
                    </div>
                    <Field label='Address'>
                        <input
                            className='search-input w-full rounded-md px-3 py-2'
                            value={financialSettings.address}
                            onChange={(e) => updateSetting('address', e.target.value)}
                        />
                    </Field>
                </div>
                <div className='card-animated p-4'>
                    <div className='text-gray-400 text-sm mb-2'>Accepted web-admin payment methods</div>
                    <div className='flex gap-3'>
                        {[
                            { key: 'payment_cash', label: 'Cash' },
                            { key: 'payment_credit_card', label: 'Credit card' },
                            { key: 'payment_account_balance', label: 'Account balance' }
                        ].map(({ key, label }) => (
                            <label key={key} className='pill'>
                                <input
                                    type='checkbox'
                                    className='mr-2'
                                    checked={financialSettings[key]}
                                    onChange={(e) => updateSetting(key, e.target.checked)}
                                />
                                {label}
                            </label>
                        ))}
                    </div>
                    <div className='text-gray-400 text-sm mb-2 mt-4'>Accepted client payment methods</div>
                    <Toggle
                        label='Account balance'
                        value={financialSettings.client_account_balance}
                        onChange={(value) => updateSetting('client_account_balance', value)}
                    />
                    <Toggle
                        label='Summon a human'
                        value={financialSettings.client_summon_human}
                        onChange={(value) => updateSetting('client_summon_human', value)}
                    />
                    <Toggle
                        label='Stripe (phone)'
                        value={financialSettings.client_stripe_phone}
                        onChange={(value) => updateSetting('client_stripe_phone', value)}
                    />
                    <Toggle
                        label='Pay after logout'
                        value={financialSettings.client_pay_after_logout}
                        onChange={(value) => updateSetting('client_pay_after_logout', value)}
                    />
                </div>
            </div>
            <div className='card-animated p-4 mt-4'>
                <div className='text-gray-400 text-sm mb-2'>Tax rates</div>
                <label className='pill inline-flex items-center mb-3'>
                    <input
                        type='checkbox'
                        className='mr-2'
                        checked={financialSettings.tax_included_in_price}
                        onChange={(e) => updateSetting('tax_included_in_price', e.target.checked)}
                    />
                    Tax calculation included in price
                </label>
                {[1, 2, 3].map(i => (
                    <div key={i} className='grid grid-cols-2 lg:grid-cols-4 gap-3 mb-2'>
                        <Field label={`Tax ${i} Name`}>
                            <input
                                className='search-input w-full rounded-md px-3 py-2'
                                value={financialSettings[`tax${i}_name`]}
                                onChange={(e) => updateSetting(`tax${i}_name`, e.target.value)}
                            />
                        </Field>
                        <Field label='Percentage'>
                            <input
                                className='search-input w-full rounded-md px-3 py-2'
                                type='number'
                                step='0.01'
                                value={financialSettings[`tax${i}_percentage`]}
                                onChange={(e) => updateSetting(`tax${i}_percentage`, parseFloat(e.target.value) || 0.00)}
                            />
                        </Field>
                    </div>
                ))}
                <div className='mt-6'>
                    <Field label='Guest legacy prices'>
                        <select
                            className='search-input rounded-md px-3 py-2'
                            value={financialSettings.guest_legacy_prices}
                            onChange={(e) => updateSetting('guest_legacy_prices', e.target.value)}
                        >
                            <option>Price per hour (INR)</option>
                            <option>Price per minute (INR)</option>
                            <option>Fixed price per session</option>
                        </select>
                    </Field>
                </div>
                <button
                    className='pill mt-2'
                    onClick={saveFinancialSettings}
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Save changes'}
                </button>
            </div>
        </div>
    );
}

export default CenterFinancial;
