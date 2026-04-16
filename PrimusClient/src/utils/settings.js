// Settings API utility functions
import { getApiBase, authHeaders } from './api.js';

export const settingsAPI = {
    // Get all settings or filter by category/key
    async getSettings(filters = {}) {
        const params = new URLSearchParams(filters);
        const base = getApiBase();
        const url = `${base}/api/settings?${params}`;
        const headers = { 'Content-Type': 'application/json', ...authHeaders() };

        let response = await fetch(url, { headers });
        if (!response.ok) {
            // Fallback to public when unauthorized
            if (response.status === 401 || response.status === 403) {
                response = await fetch(`${base}/api/settings/public`, { headers: { 'Content-Type': 'application/json' } });
            }
        }
        if (!response.ok) throw new Error('Failed to fetch settings');
        return response.json();
    },

    // Get settings by category
    async getSettingsByCategory(category) {
        return this.getSettings({ category });
    },

    // Create or update a setting
    async setSetting(category, key, value, valueType = 'string', description = null) {
        const base = getApiBase();
        const response = await fetch(`${base}/api/settings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...authHeaders()
            },
            body: JSON.stringify({
                category,
                key,
                value: value.toString(),
                value_type: valueType,
                description
            })
        });
        if (!response.ok) throw new Error('Failed to save setting');
        return response.json();
    },

    // Bulk update settings
    async bulkUpdateSettings(settings) {
        const base = getApiBase();
        const response = await fetch(`${base}/api/settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...authHeaders()
            },
            body: JSON.stringify({ settings })
        });
        if (!response.ok) throw new Error('Failed to update settings');
        return response.json();
    },

    // Update a specific setting
    async updateSetting(settingId, value, valueType = 'string', description = null) {
        const base = getApiBase();
        const response = await fetch(`${base}/api/settings/${settingId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...authHeaders()
            },
            body: JSON.stringify({
                value: value.toString(),
                value_type: valueType,
                description
            })
        });
        if (!response.ok) throw new Error('Failed to update setting');
        return response.json();
    }
};

// Convert settings array to object for easier access
export function settingsToObject(settings) {
    const obj = {};
    settings.forEach(setting => {
        let value = setting.value;
        // Backend now returns parsed values; keep fallback parsing for safety
        if (typeof value === 'string') {
            if (setting.value_type === 'boolean') {
                value = value === 'true' || value === '1';
            } else if (setting.value_type === 'number') {
                const n = Number(value);
                value = isNaN(n) ? value : n;
            } else if (setting.value_type === 'json') {
                try {
                    value = JSON.parse(value);
                } catch (e) {
                    // leave as string if not valid JSON
                }
            }
        }
        obj[setting.key] = value;
    });
    return obj;
}

// Convert object back to settings array
export function objectToSettings(obj, category) {
    return Object.entries(obj).map(([key, value]) => {
        let valueType = 'string';
        let stringValue = value;

        if (typeof value === 'boolean') {
            valueType = 'boolean';
            stringValue = value.toString();
        } else if (typeof value === 'number') {
            valueType = 'number';
            stringValue = value.toString();
        } else if (typeof value === 'object') {
            valueType = 'json';
            stringValue = JSON.stringify(value);
        } else {
            stringValue = value.toString();
        }

        return {
            category,
            key,
            value: stringValue,
            value_type: valueType
        };
    });
}
