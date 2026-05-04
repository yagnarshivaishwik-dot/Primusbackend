import React, { useState, useEffect } from 'react';
import { showToast } from '../../../utils/api';
import { settingsAPI, settingsToObject, objectToSettings } from '../../../utils/settings.js';

function ClientCustomization() {
    const [customizationSettings, setCustomizationSettings] = useState({
        center_logo: null,
        logged_out_background_type: 'video',
        logged_out_video_background: '/videos/sample-video1.mp4',
        logged_out_image_background: null,
        logged_in_background_type: 'video',
        logged_in_video_background: '/videos/sample-video2.mp4',
        logged_in_image_background: null,
        selected_theme: 'sea_blue',
        custom_theme_primary: '#4F46E5',
        custom_theme_secondary: '#7C3AED'
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [logoPreview, setLogoPreview] = useState(null);

    useEffect(() => {
        loadCustomizationSettings();
    }, []);

    const loadCustomizationSettings = async () => {
        try {
            const settings = await settingsAPI.getSettingsByCategory('client_customization');
            const settingsObj = settingsToObject(settings);
            setCustomizationSettings(prev => ({ ...prev, ...settingsObj }));
            if (settingsObj.center_logo) {
                setLogoPreview(settingsObj.center_logo);
            }
        } catch (error) {
            showToast('Failed to load customization settings');
        } finally {
            setLoading(false);
        }
    };

    const saveCustomizationSettings = async () => {
        setSaving(true);
        try {
            const settingsArray = objectToSettings(customizationSettings, 'client_customization');
            await settingsAPI.bulkUpdateSettings(settingsArray);
            showToast('Customization settings saved successfully');
        } catch (error) {
            showToast('Failed to save customization settings');
        } finally {
            setSaving(false);
        }
    };

    const handleLogoUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showToast('Please select an image file');
            return;
        }

        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            showToast('Logo file must be less than 5MB');
            return;
        }

        // Convert to base64 for preview
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result;
            setLogoPreview(base64);
            setCustomizationSettings(prev => ({ ...prev, center_logo: base64 }));
        };
        reader.readAsDataURL(file);
    };

    const removeLogo = () => {
        setLogoPreview(null);
        setCustomizationSettings(prev => ({ ...prev, center_logo: null }));
    };

    const updateSetting = (key, value) => {
        setCustomizationSettings(prev => ({ ...prev, [key]: value }));
    };

    const colorThemes = [
        { id: 'sea_blue', name: 'Sea blue', color: '#3B82F6' },
        { id: 'ufo_green', name: 'UFO green', color: '#10B981' },
        { id: 'fire_red', name: 'Fire red', color: '#EF4444' },
        { id: 'duo_ggcircuit', name: 'Duo ggCircuit', gradient: 'linear-gradient(135deg, #10B981 0%, #7C3AED 100%)' },
        { id: 'duo_egl', name: 'Duo EGL', gradient: 'linear-gradient(135deg, #F59E0B 0%, #1F2937 100%)' },
        { id: 'custom_theme', name: 'Custom theme', color: '#4F46E5', customizable: true }
    ];

    if (loading) {
        return (
            <div className="text-xl text-white font-semibold mb-4">
                Client/Customization
                <div className="text-gray-400 text-sm mt-2">Loading customization settings...</div>
            </div>
        );
    }

    return (
        <div>
            <div className="text-xl text-white font-semibold mb-4">Client/Customization</div>

            {/* Center Logo */}
            <div className="settings-card p-4 mb-4">
                <div className="text-lg text-white font-medium mb-2">Center logo</div>
                <div className="text-gray-400 text-sm mb-4">To get a better-looking client, we allow only .png file and strongly recommend using a transparent background.</div>

                <div className="mb-4">
                    <div className="text-white text-sm mb-2">Example</div>
                    <div className="flex space-x-4 mb-4">
                        <div className="flex flex-col items-center">
                            <div className="w-16 h-16 bg-gray-700 rounded-lg flex items-center justify-center mb-2">
                                <span className="text-white text-xs">✓</span>
                            </div>
                            <span className="text-green-400 text-xs">Good</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center mb-2">
                                <span className="text-black text-xs">✗</span>
                            </div>
                            <span className="text-red-400 text-xs">Bad</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center space-x-4">
                    {logoPreview ? (
                        <div className="relative">
                            <img src={logoPreview} alt="Logo preview" className="w-32 h-32 object-contain bg-gray-800 rounded-lg border-2 border-dashed border-gray-600" />
                            <button
                                onClick={removeLogo}
                                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                            >
                                ✕
                            </button>
                        </div>
                    ) : (
                        <div className="w-32 h-32 border-2 border-dashed border-gray-600 rounded-lg flex flex-col items-center justify-center text-gray-400">
                            <span className="text-2xl mb-2">📸</span>
                            <span className="text-xs text-center">No logo</span>
                        </div>
                    )}

                    <div className="flex flex-col space-y-2">
                        <label className="settings-button-primary rounded-md px-4 py-2 cursor-pointer">
                            Change center logo
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleLogoUpload}
                                className="hidden"
                            />
                        </label>
                        <button
                            onClick={removeLogo}
                            className="settings-button rounded-md px-4 py-2"
                            disabled={!logoPreview}
                        >
                            Remove center logo
                        </button>
                    </div>
                </div>
            </div>

            {/* PC Group Background Customization */}
            <div className="settings-card p-4 mb-4">
                <div className="text-lg text-white font-medium mb-2">PC group Primus background customization</div>
                <div className="text-gray-400 text-sm mb-4">With these settings, you will be able to customize the backgrounds across the Primus UI and customize different PC groups.</div>

                <div className="bg-gray-800 rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-white font-medium">General Systems</span>
                        <button className="settings-button rounded-md px-3 py-1 text-sm">⚙️ PC Group settings</button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Logged out */}
                        <div>
                            <div className="text-white font-medium mb-3">Logged out</div>
                            <div className="text-gray-400 text-sm mb-3">Background type</div>
                            <div className="flex space-x-4 mb-4">
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="radio"
                                        name="logged_out_bg"
                                        value="video"
                                        checked={customizationSettings.logged_out_background_type === 'video'}
                                        onChange={() => updateSetting('logged_out_background_type', 'video')}
                                        className="text-purple-500"
                                    />
                                    <span className="text-white">Video background</span>
                                </label>
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="radio"
                                        name="logged_out_bg"
                                        value="image"
                                        checked={customizationSettings.logged_out_background_type === 'image'}
                                        onChange={() => updateSetting('logged_out_background_type', 'image')}
                                        className="text-purple-500"
                                    />
                                    <span className="text-white">Image background</span>
                                </label>
                            </div>

                            <div className="text-gray-400 text-sm mb-2">Select video background</div>
                            <div className="relative">
                                <video
                                    className="w-full h-32 object-cover rounded-lg bg-gray-900"
                                    poster="/images/video-poster1.jpg"
                                    muted
                                >
                                    <source src={customizationSettings.logged_out_video_background} type="video/mp4" />
                                </video>
                                <div className="absolute inset-0 bg-black bg-opacity-40 rounded-lg flex items-center justify-center">
                                    <span className="text-white text-2xl">▶️</span>
                                </div>
                            </div>
                        </div>

                        {/* Logged in */}
                        <div>
                            <div className="text-white font-medium mb-3">Logged in</div>
                            <div className="text-gray-400 text-sm mb-3">Background type</div>
                            <div className="flex space-x-4 mb-4">
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="radio"
                                        name="logged_in_bg"
                                        value="video"
                                        checked={customizationSettings.logged_in_background_type === 'video'}
                                        onChange={() => updateSetting('logged_in_background_type', 'video')}
                                        className="text-purple-500"
                                    />
                                    <span className="text-white">Video background</span>
                                </label>
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="radio"
                                        name="logged_in_bg"
                                        value="image"
                                        checked={customizationSettings.logged_in_background_type === 'image'}
                                        onChange={() => updateSetting('logged_in_background_type', 'image')}
                                        className="text-purple-500"
                                    />
                                    <span className="text-white">Image background</span>
                                </label>
                            </div>

                            <div className="text-gray-400 text-sm mb-2">Select video background</div>
                            <div className="relative">
                                <video
                                    className="w-full h-32 object-cover rounded-lg bg-gray-900"
                                    poster="/images/video-poster2.jpg"
                                    muted
                                >
                                    <source src={customizationSettings.logged_in_video_background} type="video/mp4" />
                                </video>
                                <div className="absolute inset-0 bg-black bg-opacity-40 rounded-lg flex items-center justify-center">
                                    <span className="text-white text-2xl">▶️</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Color Customization */}
            <div className="settings-card p-4 mb-4">
                <div className="text-lg text-white font-medium mb-2">Color customization (Only for Primus client 3.0)</div>

                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    {colorThemes.map(theme => (
                        <button
                            key={theme.id}
                            className={`relative p-4 rounded-lg border-2 transition-all ${customizationSettings.selected_theme === theme.id
                                ? 'border-purple-500 ring-2 ring-purple-500/50'
                                : 'border-gray-600 hover:border-gray-500'
                                }`}
                            onClick={() => updateSetting('selected_theme', theme.id)}
                        >
                            <div
                                className="w-full h-16 rounded-lg mb-2"
                                style={{
                                    background: theme.gradient || theme.color,
                                }}
                            >
                                {theme.customizable && (
                                    <div className="h-full flex items-center justify-center">
                                        <span className="text-white text-lg">🎨</span>
                                    </div>
                                )}
                            </div>
                            <div className="text-white text-sm font-medium">{theme.name}</div>
                        </button>
                    ))}
                </div>

                <div className="flex justify-center mb-6">
                    <button className="settings-button rounded-lg px-6 py-3">Apply theme</button>
                </div>

                {/* Client Preview */}
                <div className="relative bg-gray-800 rounded-lg overflow-hidden">
                    <div className="relative h-80">
                        <img
                            src="/images/client-preview-bg.jpg"
                            alt="Client preview"
                            className="w-full h-full object-cover"
                        />

                        {/* Logo overlay */}
                        <div className="absolute top-4 left-4">
                            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2 flex items-center space-x-2">
                                <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
                                    <span className="text-white text-xs">GG</span>
                                </div>
                                <span className="text-white font-bold">CIRCUIT</span>
                            </div>
                        </div>

                        {/* Game grid overlay */}
                        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 flex space-x-2">
                            <span className="text-white bg-black/50 px-2 py-1 rounded text-sm">Games</span>
                            <span className="text-gray-300 bg-black/30 px-2 py-1 rounded text-sm">Apps</span>
                            <span className="text-gray-300 bg-black/30 px-2 py-1 rounded text-sm">Shop</span>
                            <span className="text-gray-300 bg-black/30 px-2 py-1 rounded text-sm">Prize Vault</span>
                        </div>

                        {/* Game cards */}
                        <div className="absolute top-16 left-4 grid grid-cols-3 gap-2">
                            {['RAINBOW SIX', 'Cars 3', 'Fortnite', 'Cars 2', 'Apex Legends', 'The Witcher'].map((game, index) => (
                                <div key={index} className="w-20 h-20 bg-gray-800/80 rounded-lg flex items-center justify-center">
                                    <span className="text-white text-xs text-center">{game}</span>
                                </div>
                            ))}
                        </div>

                        {/* Side panels */}
                        <div className="absolute top-4 right-4 w-64 space-y-4">
                            <div className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-4">
                                <h3 className="text-white font-bold mb-2">Book your next gaming session</h3>
                                <p className="text-gray-300 text-sm mb-3">Scan the QR with your phone and you can complete your next visit.</p>
                                <div className="w-16 h-16 bg-white rounded-lg mx-auto"></div>
                            </div>

                            <div className="bg-teal-500/90 backdrop-blur-sm rounded-lg p-4">
                                <div className="text-center">
                                    <div className="text-white text-2xl font-bold">5</div>
                                    <div className="text-white text-sm">HOURS</div>
                                    <div className="text-white text-xs">5 hours GamePass</div>
                                    <div className="text-white text-xs">Add 5 hours to your GamePass wallet</div>
                                </div>
                            </div>

                            <div className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-3">
                                <h4 className="text-white font-medium mb-2">Social</h4>
                                <div className="space-y-1 text-xs text-gray-300">
                                    <div>🎮 GTVietnam just got a Fortnite Winner Royale</div>
                                    <div>⚡ GTVietnam has accepted your invitation to connect</div>
                                    <div>🎮 arcanerwar just spent 5,000 coins on a free day pass!</div>
                                </div>
                            </div>
                        </div>

                        {/* Bottom navigation */}
                        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2">
                            <button className="bg-gray-700/80 text-white px-4 py-2 rounded-lg text-sm">◀ Client login</button>
                            <button className="bg-teal-500 text-white px-4 py-2 rounded-lg text-sm font-medium">Client home</button>
                            <button className="bg-gray-700/80 text-white px-4 py-2 rounded-lg text-sm">▶</button>
                        </div>

                        {/* User info overlay */}
                        <div className="absolute top-4 right-4">
                            <span className="text-white text-sm">🎮 PRIME01 📍 1</span>
                            <span className="text-white text-sm ml-4">⏰ 10:17</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Save button */}
            <div className="mt-6">
                <button
                    className="settings-button-primary rounded-md px-4 py-2"
                    onClick={saveCustomizationSettings}
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Save changes'}
                </button>
            </div>
        </div>
    );
}

export default ClientCustomization;
