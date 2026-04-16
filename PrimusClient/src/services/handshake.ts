import { invoke } from "../utils/invoke";
import { apiClient } from "./apiClient";
import axios from "axios";
// @ts-ignore - JS file without type declarations
import { getApiBase } from "../utils/api";

export interface HandshakeData {
    pc_id: number;
    license_key: string;
    cafe_id: number;
    name: string;
}

export async function performHandshake(adminEmail: string, adminPassword: string, pcName: string): Promise<HandshakeData> {
    console.log('[Handshake] Starting handshake process...');
    const baseUrl = getApiBase();
    console.log('[Handshake] API Base:', baseUrl);

    // 1. Authenticate Admin (One-time)
    console.log('[Handshake] Step 1: Authenticating admin...');
    const formData = new FormData();
    formData.append('username', adminEmail);
    formData.append('password', adminPassword);

    let token: string;
    try {
        // Use raw axios to bypass global interceptors (which reload page on 401)
        const loginRes = await axios.post(`${baseUrl}/api/auth/login`, formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        token = loginRes.data.access_token;
        console.log('[Handshake] Step 1 SUCCESS: Admin authenticated');
    } catch (err: any) {
        console.error('[Handshake] Step 1 FAILED:', err.response?.data || err.message);
        throw new Error(`Login failed: ${err.response?.data?.detail || err.message}`);
    }

    // 2. Generate Hardware Fingerprint
    console.log('[Handshake] Step 2: Generating hardware fingerprint...');
    let fingerprint: string;
    try {
        fingerprint = await invoke<string>("generate_hardware_fingerprint");
        console.log('[Handshake] Step 2 SUCCESS: Fingerprint generated:', fingerprint.substring(0, 16) + '...');
    } catch (err: any) {
        console.error('[Handshake] Step 2 FAILED:', err);
        throw new Error(`Failed to generate hardware fingerprint: ${err.message}`);
    }

    // 3. Get cafe info (optional, for logging)
    console.log('[Handshake] Step 3: Fetching cafe info...');
    try {
        const cafeRes = await apiClient.get('/cafe/mine', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log('[Handshake] Step 3 SUCCESS: Cafe info:', cafeRes.data?.name || 'N/A');
    } catch (err: any) {
        console.warn('[Handshake] Step 3 WARNING: Could not fetch cafe info:', err.response?.data?.detail || err.message);
        // Continue - cafe info is optional
    }

    // 4. Get License Key - try both endpoints
    console.log('[Handshake] Step 4: Fetching license...');
    let license: any = null;

    // Try /license/ first (returns all licenses for cafe)
    try {
        const licenseRes = await apiClient.get('/license/', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log('[Handshake] Step 4a: /license/ response:', licenseRes.data);
        if (Array.isArray(licenseRes.data) && licenseRes.data.length > 0) {
            // Find first active license
            license = licenseRes.data.find((l: any) => l.is_active !== false) || licenseRes.data[0];
        }
    } catch (err: any) {
        console.warn('[Handshake] Step 4a WARNING: /license/ failed:', err.response?.data?.detail || err.message);
    }

    // Fallback: try /license/mine
    if (!license) {
        try {
            const mineRes = await apiClient.get('/license/mine', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            console.log('[Handshake] Step 4b: /license/mine response:', mineRes.data);
            if (Array.isArray(mineRes.data) && mineRes.data.length > 0) {
                license = mineRes.data.find((l: any) => l.is_active !== false) || mineRes.data[0];
            }
        } catch (err: any) {
            console.warn('[Handshake] Step 4b WARNING: /license/mine failed:', err.response?.data?.detail || err.message);
        }
    }

    if (!license) {
        console.error('[Handshake] Step 4 FAILED: No license found');
        throw new Error("No active license found for this cafe. Please contact your administrator to obtain a license key.");
    }
    console.log('[Handshake] Step 4 SUCCESS: License found:', license.key);

    // 5. Register Device (Idempotent)
    console.log('[Handshake] Step 5: Registering device...');
    let pcData: any;
    try {
        const regRes = await apiClient.post('/clientpc/register', {
            name: pcName,
            license_key: license.key,
            hardware_fingerprint: fingerprint,
            capabilities: {
                os: "windows",
                version: "1.0.0",
                features: ["lock", "unlock", "message", "screenshot"]
            }
        }, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        pcData = regRes.data;
        console.log('[Handshake] Step 5 SUCCESS: Device registered with ID:', pcData.id);
    } catch (err: any) {
        console.error('[Handshake] Step 5 FAILED:', err.response?.data || err.message);
        throw new Error(`Device registration failed: ${err.response?.data?.detail || err.message}`);
    }

    // 6. Save Credentials locally
    console.log('[Handshake] Step 6: Saving credentials locally...');
    console.log('[Handshake] DEBUG: pcData =', JSON.stringify(pcData));
    console.log('[Handshake] DEBUG: device_secret present?', !!pcData.device_secret);
    try {
        await invoke("save_device_credentials", {
            pcId: Number(pcData.id),
            licenseKey: String(license.key),
            deviceSecret: String(pcData.device_secret || '')
        });
        console.log('[Handshake] Step 6 SUCCESS: Credentials saved');
    } catch (err: any) {
        console.error('[Handshake] Step 6 FAILED:', err);
        const errorMessage = typeof err === 'string' ? err : (err.message || JSON.stringify(err));
        throw new Error(`Failed to save device credentials: ${errorMessage}`);
    }

    // 7. Restart command service with new credentials
    console.log('[Handshake] Step 7: Restarting command service...');
    try {
        const { commandService } = await import('./commandService');
        const restarted = await commandService.restart();
        if (restarted) {
            console.log('[Handshake] Step 7 SUCCESS: Command service restarted');
        } else {
            console.warn('[Handshake] Step 7 WARNING: Command service restart returned false');
        }
    } catch (err: any) {
        console.error('[Handshake] Step 7 WARNING: Failed to restart command service:', err);
        // Don't fail handshake for this - the user can manually refresh
    }

    console.log('[Handshake] ✅ HANDSHAKE COMPLETE!');
    return {
        pc_id: pcData.id,
        license_key: license.key,
        cafe_id: pcData.cafe_id,
        name: pcData.name
    };
}

