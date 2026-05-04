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

function CenterLanguage() {
    const [languageSettings, setLanguageSettings] = useState({
        default_language: 'en',
        supported_languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'],
        auto_detect_language: true,
        allow_user_language_selection: true,
        fallback_language: 'en'
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const languages = [
        { code: 'en', name: 'English', flag: '🇺🇸', native: 'English' },
        { code: 'es', name: 'Spanish', flag: '🇪🇸', native: 'Español' },
        { code: 'fr', name: 'French', flag: '🇫🇷', native: 'Français' },
        { code: 'de', name: 'German', flag: '🇩🇪', native: 'Deutsch' },
        { code: 'it', name: 'Italian', flag: '🇮🇹', native: 'Italiano' },
        { code: 'pt', name: 'Portuguese', flag: '🇵🇹', native: 'Português' },
        { code: 'ru', name: 'Russian', flag: '🇷🇺', native: 'Русский' },
        { code: 'ja', name: 'Japanese', flag: '🇯🇵', native: '日本語' },
        { code: 'ko', name: 'Korean', flag: '🇰🇷', native: '한국어' },
        { code: 'zh', name: 'Chinese', flag: '🇨🇳', native: '中文' },
        { code: 'ar', name: 'Arabic', flag: '🇸🇦', native: 'العربية' },
        { code: 'hi', name: 'Hindi', flag: '🇮🇳', native: 'हिन्दी' },
        { code: 'nl', name: 'Dutch', flag: '🇳🇱', native: 'Nederlands' },
        { code: 'sv', name: 'Swedish', flag: '🇸🇪', native: 'Svenska' },
        { code: 'da', name: 'Danish', flag: '🇩🇰', native: 'Dansk' },
        { code: 'no', name: 'Norwegian', flag: '🇳🇴', native: 'Norsk' },
        { code: 'fi', name: 'Finnish', flag: '🇫🇮', native: 'Suomi' },
        { code: 'pl', name: 'Polish', flag: '🇵🇱', native: 'Polski' }
    ];

    useEffect(() => {
        loadLanguageSettings();
    }, []);

    const loadLanguageSettings = async () => {
        try {
            const settings = await settingsAPI.getSettingsByCategory('language');
            const settingsObj = settingsToObject(settings);

            setLanguageSettings(prev => ({
                ...prev,
                ...settingsObj,
                supported_languages: Array.isArray(settingsObj.supported_languages)
                    ? settingsObj.supported_languages
                    : prev.supported_languages
            }));
        } catch (error) {
            showToast('Failed to load language settings', 'error');
        } finally {
            setLoading(false);
        }
    };

    const saveLanguageSettings = async () => {
        setSaving(true);
        try {
            const settingsToUpdate = objectToSettings(languageSettings, 'language');
            await settingsAPI.bulkUpdateSettings(settingsToUpdate);
            showToast('Language settings saved successfully', 'success');
        } catch (error) {
            showToast('Failed to save language settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    const updateSetting = (key, value) => {
        setLanguageSettings(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const toggleLanguage = (langCode) => {
        const current = languageSettings.supported_languages;
        const updated = current.includes(langCode)
            ? current.filter(code => code !== langCode)
            : [...current, langCode];

        // Ensure at least one language is supported
        if (updated.length === 0) {
            showToast('At least one language must be supported', 'error');
            return;
        }

        updateSetting('supported_languages', updated);

        // If default language is no longer supported, reset it
        if (!updated.includes(languageSettings.default_language)) {
            updateSetting('default_language', updated[0]);
        }

        // If fallback language is no longer supported, reset it
        if (!updated.includes(languageSettings.fallback_language)) {
            updateSetting('fallback_language', updated[0]);
        }
    };

    const getLanguageName = (code) => {
        const lang = languages.find(l => l.code === code);
        return lang ? `${lang.flag} ${lang.name} (${lang.native})` : code;
    };

    const getLanguageFlag = (code) => {
        const lang = languages.find(l => l.code === code);
        return lang ? lang.flag : '🏳️';
    };

    if (loading) {
        return (
            <div className='text-xl text-white font-semibold mb-4'>
                Center/Language
                <div className='text-gray-400 text-sm mt-2'>Loading language settings...</div>
            </div>
        );
    }

    return (
        <div>
            <div className='text-xl text-white font-semibold mb-4'>Center/Language</div>

            {/* Language Configuration */}
            <div className='card-animated p-4 mb-4'>
                <div className='text-gray-400 text-sm mb-2'>Language Configuration</div>
                <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
                    <div>
                        <Field label='Default Language'>
                            <select
                                className='search-input rounded-md px-3 py-2 w-full'
                                value={languageSettings.default_language}
                                onChange={(e) => updateSetting('default_language', e.target.value)}
                            >
                                {languageSettings.supported_languages.map(code => (
                                    <option key={code} value={code}>
                                        {getLanguageName(code)}
                                    </option>
                                ))}
                            </select>
                        </Field>

                        <Field label='Fallback Language'>
                            <select
                                className='search-input rounded-md px-3 py-2 w-full'
                                value={languageSettings.fallback_language}
                                onChange={(e) => updateSetting('fallback_language', e.target.value)}
                            >
                                {languageSettings.supported_languages.map(code => (
                                    <option key={code} value={code}>
                                        {getLanguageName(code)}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    </div>

                    <div>
                        <div className='mb-4'>
                            <div className='text-gray-300 text-sm mb-2'>Language Detection</div>
                            <Toggle
                                label='Auto-detect user language'
                                value={languageSettings.auto_detect_language}
                                onChange={(value) => updateSetting('auto_detect_language', value)}
                            />
                            <Toggle
                                label='Allow users to select language'
                                value={languageSettings.allow_user_language_selection}
                                onChange={(value) => updateSetting('allow_user_language_selection', value)}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Supported Languages */}
            <div className='card-animated p-4 mb-4'>
                <div className='text-gray-400 text-sm mb-2'>
                    Supported Languages ({languageSettings.supported_languages.length})
                </div>
                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3'>
                    {languages.map(lang => {
                        const isSupported = languageSettings.supported_languages.includes(lang.code);
                        const isDefault = languageSettings.default_language === lang.code;
                        const isFallback = languageSettings.fallback_language === lang.code;

                        return (
                            <div
                                key={lang.code}
                                className={`border rounded-md p-3 cursor-pointer transition-all ${isSupported
                                    ? 'border-primary/50 bg-primary/10'
                                    : 'border-white/10 hover:border-white/20'
                                    }`}
                                onClick={() => toggleLanguage(lang.code)}
                            >
                                <div className='flex items-center justify-between'>
                                    <div className='flex items-center gap-2'>
                                        <span className='text-lg'>{lang.flag}</span>
                                        <div>
                                            <div className='text-white text-sm font-medium'>{lang.name}</div>
                                            <div className='text-gray-400 text-xs'>{lang.native}</div>
                                        </div>
                                    </div>
                                    <div className='flex items-center gap-2'>
                                        {isDefault && (
                                            <span className='text-xs bg-blue-600/20 text-blue-400 px-2 py-1 rounded'>
                                                Default
                                            </span>
                                        )}
                                        {isFallback && !isDefault && (
                                            <span className='text-xs bg-gray-600/20 text-gray-400 px-2 py-1 rounded'>
                                                Fallback
                                            </span>
                                        )}
                                        <input
                                            type='checkbox'
                                            checked={isSupported}
                                            onChange={() => toggleLanguage(lang.code)}
                                            className='ml-2'
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Language Statistics */}
            <div className='grid grid-cols-1 lg:grid-cols-4 gap-4'>
                <div className='card-animated p-4 text-center'>
                    <div className='text-2xl mb-2'>🌍</div>
                    <div className='text-white text-lg font-semibold'>
                        {languageSettings.supported_languages.length}
                    </div>
                    <div className='text-gray-400 text-sm'>Supported Languages</div>
                </div>
                <div className='card-animated p-4 text-center'>
                    <div className='text-2xl mb-2'>{getLanguageFlag(languageSettings.default_language)}</div>
                    <div className='text-white text-sm font-medium'>
                        {languages.find(l => l.code === languageSettings.default_language)?.name || languageSettings.default_language}
                    </div>
                    <div className='text-gray-400 text-xs'>Default Language</div>
                </div>
                <div className='card-animated p-4 text-center'>
                    <div className='text-2xl mb-2'>{getLanguageFlag(languageSettings.fallback_language)}</div>
                    <div className='text-white text-sm font-medium'>
                        {languages.find(l => l.code === languageSettings.fallback_language)?.name || languageSettings.fallback_language}
                    </div>
                    <div className='text-gray-400 text-xs'>Fallback Language</div>
                </div>
                <div className='card-animated p-4 text-center'>
                    <div className='text-2xl mb-2'>
                        {languageSettings.auto_detect_language ? '🎯' : '⚙️'}
                    </div>
                    <div className='text-white text-sm font-medium'>
                        {languageSettings.auto_detect_language ? 'Auto' : 'Manual'}
                    </div>
                    <div className='text-gray-400 text-xs'>Language Detection</div>
                </div>
            </div>

            <div className='mt-6'>
                <button
                    className='pill'
                    onClick={saveLanguageSettings}
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Save changes'}
                </button>
            </div>
        </div>
    );
}

export default CenterLanguage;
