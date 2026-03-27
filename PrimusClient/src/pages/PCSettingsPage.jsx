import { useState } from 'react';
import { ArrowLeft, Monitor, Mouse, Speaker, Volume2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const languages = [
    { code: 'en', name: 'English' },
    { code: 'cs', name: 'Čeština' },
    { code: 'es', name: 'Español' },
    { code: 'el', name: 'Ελληνικά' },
    { code: 'et', name: 'Eesti keel' },
    { code: 'fi', name: 'Suomi' },
    { code: 'fr', name: 'Français' },
    { code: 'hu', name: 'Magyar' },
    { code: 'id', name: 'Bahasa Indonesia' },
    { code: 'it', name: 'Italiano' },
    { code: 'lt', name: 'Lietuvių kalba' },
    { code: 'lv', name: 'Latviešu valoda' },
    { code: 'pt', name: 'Português' },
    { code: 'pt-br', name: 'Português (BR)' },
    { code: 'bg', name: 'Български' },
    { code: 'da', name: 'Danish' },
    { code: 'de', name: 'Deutsch' },
    { code: 'no', name: 'Norsk' },
    { code: 'nl', name: 'Nederlands' },
    { code: 'sv', name: 'Svenska' },
    { code: 'pl', name: 'Polski' },
    { code: 'ro', name: 'Română' },
    { code: 'ru', name: 'Русский' },
    { code: 'sk', name: 'Slovenčina' },
    { code: 'sl', name: 'Slovenščina' },
    { code: 'tr', name: 'Türkçe' },
    { code: 'uk', name: 'Українська' },
    { code: 'mn', name: 'Монгол хэл' },
];

const windowsSettings = [
    { id: 'display', name: 'Display Settings', icon: Monitor },
    { id: 'mouse', name: 'Mouse Settings', icon: Mouse },
    { id: 'sound-devices', name: 'Sound Devices', icon: Speaker },
    { id: 'volume', name: 'Sound Volume', icon: Volume2 },
];

const PCSettingsPage = () => {
    const navigate = useNavigate();
    const [selectedLanguage, setSelectedLanguage] = useState('en');

    const handleWindowsSetting = (settingId) => {
        // These would trigger Windows settings panels via Tauri commands
        console.log(`Opening Windows setting: ${settingId}`);
    };

    return (
        <div className="page-content">
            {/* Back Button */}
            <button
                className="back-btn"
                onClick={() => navigate(-1)}
            >
                <ArrowLeft size={18} />
                Back
            </button>

            {/* Page Title */}
            <h1 className="settings-page-title">PC settings</h1>

            {/* Windows Settings Section */}
            <section className="settings-section">
                <h2 className="settings-section-title">Windows settings</h2>
                <div className="windows-settings-grid">
                    {windowsSettings.map((setting) => {
                        const IconComponent = setting.icon;
                        return (
                            <button
                                key={setting.id}
                                className="windows-setting-card"
                                onClick={() => handleWindowsSetting(setting.id)}
                            >
                                <div className="windows-setting-icon">
                                    <IconComponent size={24} />
                                </div>
                                <span className="windows-setting-name">{setting.name}</span>
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* Client Language Section */}
            <section className="settings-section">
                <h2 className="settings-section-title">Client language</h2>
                <div className="language-grid">
                    {languages.map((lang) => (
                        <label
                            key={lang.code}
                            className={`language-option ${selectedLanguage === lang.code ? 'selected' : ''}`}
                        >
                            <span className="language-name">{lang.name}</span>
                            <input
                                type="radio"
                                name="language"
                                value={lang.code}
                                checked={selectedLanguage === lang.code}
                                onChange={() => setSelectedLanguage(lang.code)}
                                className="language-radio"
                            />
                            <span className="language-radio-custom"></span>
                        </label>
                    ))}
                </div>
            </section>
        </div>
    );
};

export default PCSettingsPage;
