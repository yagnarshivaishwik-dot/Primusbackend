import { invoke } from "../utils/invoke";
import { apiClient } from "./apiClient";
import { signRequest } from "../utils/signature";

// device_secret REMOVED from interface for security
export interface DeviceCredentials {
    pc_id: number;
    license_key: string;
    is_registered: boolean;
}

const CLIENT_CAPABILITIES = {
    version: "1.0.0",
    features: ["lock", "unlock", "message", "screenshot", "shutdown", "reboot", "restart", "login", "logout", "logoff"]
};

// Connection states for better tracking
export type ConnectionState = 'disconnected' | 'connecting' | 'validating' | 'connected' | 'needs_handshake';

class CommandService {
    private pcId: number | null = null;
    private isRunning: boolean = false;
    private pollInterval: number = 2000;
    private heartbeatInterval: number = 15000; // Master System says 10-15s
    private consecutiveFailures: number = 0;
    private maxConsecutiveFailures: number = 3; // After 3 failures, trigger re-handshake
    private connectionState: ConnectionState = 'disconnected';

    private onEventCallbacks: ((_event: any) => void)[] = [];
    private onConnectionChangeCallbacks: ((_connected: boolean) => void)[] = [];
    private onNeedHandshakeCallbacks: (() => void)[] = [];
    private onConnectionStateChangeCallbacks: ((_state: ConnectionState) => void)[] = [];

    onEvent(callback: (_event: any) => void) {
        this.onEventCallbacks.push(callback);
    }

    onConnectionChange(callback: (_connected: boolean) => void) {
        this.onConnectionChangeCallbacks.push(callback);
    }

    /**
     * Register callback for when re-handshake is needed (credentials invalid/expired)
     */
    onNeedHandshake(callback: () => void) {
        this.onNeedHandshakeCallbacks.push(callback);
    }

    /**
     * Register callback for detailed connection state changes
     */
    onConnectionStateChange(callback: (_state: ConnectionState) => void) {
        this.onConnectionStateChangeCallbacks.push(callback);
    }

    private notifyEvent(event: any) {
        this.onEventCallbacks.forEach(cb => cb(event));
    }

    private notifyConnectionChange(connected: boolean) {
        this.onConnectionChangeCallbacks.forEach(cb => cb(connected));
    }

    private notifyNeedHandshake() {
        console.log("[CommandService] Triggering re-handshake...");
        this.onNeedHandshakeCallbacks.forEach(cb => cb());
    }

    private setConnectionState(state: ConnectionState) {
        this.connectionState = state;
        this.onConnectionStateChangeCallbacks.forEach(cb => cb(state));
        // Also update legacy connected boolean
        this.notifyConnectionChange(state === 'connected');
    }

    getConnectionState(): ConnectionState {
        return this.connectionState;
    }

    /**
     * ENHANCED: Start the command service with credential validation
     * If credentials are invalid (401/403 on test heartbeat), triggers re-handshake
     */
    async start(): Promise<boolean> {
        if (this.isRunning) return true;

        this.setConnectionState('connecting');
        console.log("[CommandService] Starting...");

        // Step 1: Load credentials
        const creds = await invoke<DeviceCredentials | null>("get_device_credentials");
        if (!creds || !creds.pc_id) {
            console.log("[CommandService] No valid device credentials found. Handshake required.");
            this.setConnectionState('needs_handshake');
            this.notifyNeedHandshake();
            return false;
        }

        this.pcId = creds.pc_id;
        console.log(`[CommandService] Loaded credentials for PC #${this.pcId}`);

        // Step 2: Validate credentials with a test heartbeat (STATELESS RECONNECT)
        this.setConnectionState('validating');
        const isValid = await this.validateCredentials();

        if (!isValid) {
            console.log("[CommandService] Credentials validation failed. Clearing and requesting re-handshake.");
            await this.clearCredentialsAndRequestHandshake();
            return false;
        }

        // Step 3: Credentials valid - start normal operation
        this.isRunning = true;
        this.consecutiveFailures = 0;
        this.setConnectionState('connected');

        console.log(`[CommandService] ✅ Connected successfully for PC #${this.pcId}`);

        // Start loops in background (don't await - they run forever)
        this.startHeartbeatLoop();
        this.startCommandPullLoop();

        return true;
    }

    /**
     * Validate stored credentials by sending a test heartbeat
     * Returns true if credentials are valid, false if 401/403
     */
    private async validateCredentials(): Promise<boolean> {
        if (!this.pcId) return false;

        try {
            console.log("[CommandService] Validating credentials with test heartbeat...");
            await this.signedPost('/clientpc/heartbeat', {});
            console.log("[CommandService] ✅ Credentials valid");
            return true;
        } catch (error: any) {
            const status = error?.response?.status;
            const detail = error?.response?.data?.detail || error.message;

            console.error(`[CommandService] Validation failed: HTTP ${status} - ${detail}`);

            // 401/403 means credentials are invalid/expired
            if (status === 401 || status === 403) {
                return false;
            }

            // Other errors (network, 500, etc.) - credentials might still be valid
            // but we can't connect right now. Don't trigger re-handshake for these.
            console.warn("[CommandService] Network/server error during validation. Will retry.");
            return true; // Assume credentials OK, just network issue
        }
    }

    /**
     * Clear stored credentials and trigger re-handshake flow
     */
    private async clearCredentialsAndRequestHandshake() {
        try {
            console.log("[CommandService] Clearing stale credentials...");
            await invoke("reset_device_credentials");
            console.log("[CommandService] Credentials cleared.");
        } catch (e) {
            console.error("[CommandService] Failed to clear credentials:", e);
        }

        this.pcId = null;
        this.isRunning = false;
        this.setConnectionState('needs_handshake');
        this.notifyNeedHandshake();
    }

    /**
     * Handle authentication errors during operation
     * After maxConsecutiveFailures, triggers re-handshake
     */
    private async handleAuthError(error: any) {
        const status = error?.response?.status;

        if (status === 401 || status === 403) {
            this.consecutiveFailures++;
            console.warn(`[CommandService] Auth error (${this.consecutiveFailures}/${this.maxConsecutiveFailures})`);

            if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
                console.error("[CommandService] Max auth failures reached. Re-handshake required.");
                this.stop();
                await this.clearCredentialsAndRequestHandshake();
            }
        }
    }

    private async startHeartbeatLoop() {
        while (this.isRunning) {
            try {
                if (this.pcId) {
                    await this.signedPost('/clientpc/heartbeat', {});
                    this.consecutiveFailures = 0; // Reset on success
                    this.setConnectionState('connected');
                }
            } catch (e: any) {
                console.error("[CommandService] Heartbeat failed:", e?.response?.status || e.message);
                this.setConnectionState('disconnected');
                await this.handleAuthError(e);
            }
            await new Promise(r => setTimeout(r, this.heartbeatInterval));
        }
    }

    private async startCommandPullLoop() {
        while (this.isRunning) {
            try {
                if (this.pcId) {
                    // MASTER SYSTEM: Long-poll for commands (switched to POST for signing)
                    const response = await this.signedPost('/command/pull', {
                        timeout: 25
                    });

                    this.consecutiveFailures = 0; // Reset on success
                    this.setConnectionState('connected');

                    const commands = response.data;
                    if (commands && commands.length > 0) {
                        for (const cmd of commands) {
                            // Check if this is a "special" event command or a real system command
                            if (["chat.message", "pc.time.update", "shop.purchase", "notification", "message"].includes(cmd.command)) {
                                try {
                                    const payload = typeof cmd.params === 'string' ? JSON.parse(cmd.params) : cmd.params;
                                    this.notifyEvent({ event: cmd.command, payload });
                                    await this.ack(cmd.id, "SUCCEEDED", { ok: true });
                                } catch (e) {
                                    console.error("Failed to parse event params", e);
                                    await this.ack(cmd.id, "FAILED", { error: "Parse error" });
                                }
                            } else {
                                await this.executeCommand(cmd);
                            }
                        }
                    }
                }
            } catch (e: any) {
                console.error("[CommandService] Command pull failed:", e?.response?.status || e.message);
                this.setConnectionState('disconnected');
                await this.handleAuthError(e);
                await new Promise(r => setTimeout(r, 5000));
            }
            await new Promise(r => setTimeout(r, 500));
        }
    }

    private async executeCommand(cmd: any) {
        console.log(`[CommandService] Executing command: ${cmd.command}`, cmd.params);
        await this.ack(cmd.id, "RUNNING");

        try {
            let result = null;
            switch (cmd.command) {
                case "lock":
                    this.notifyEvent({ event: 'lock', message: cmd.params });
                    // Actually lock the workstation
                    try {
                        await invoke("system_lock");
                    } catch (e) {
                        console.warn("System lock failed, using event only");
                    }
                    result = { status: "locked" };
                    break;
                case "unlock":
                    this.notifyEvent({ event: 'unlock' });
                    result = { status: "unlocked" };
                    break;
                case "message": {
                    const params = typeof cmd.params === 'string' ? JSON.parse(cmd.params) : cmd.params;
                    await invoke("show_notification", { title: "Admin Message", body: params.text || params });
                    this.notifyEvent({ event: 'message', message: params.text || params });
                    result = { status: "displayed" };
                    break;
                }
                case "shutdown":
                    this.notifyEvent({ event: 'shutdown' });
                    // Actually shutdown the computer
                    try {
                        await invoke("system_shutdown");
                        result = { status: "shutting_down" };
                    } catch (e: any) {
                        console.error("Shutdown failed:", e);
                        result = { status: "shutdown_failed", error: e.message };
                    }
                    break;
                case "restart":
                case "reboot":
                    this.notifyEvent({ event: 'restart' });
                    // Actually restart the computer
                    try {
                        await invoke("system_restart");
                        result = { status: "restarting" };
                    } catch (e: any) {
                        console.error("Restart failed:", e);
                        result = { status: "restart_failed", error: e.message };
                    }
                    break;
                case "logoff":
                    this.notifyEvent({ event: 'logoff' });
                    try {
                        await invoke("system_logoff");
                        result = { status: "logging_off" };
                    } catch (e: any) {
                        console.error("Logoff failed:", e);
                        result = { status: "logoff_failed", error: e.message };
                    }
                    break;
                case "cancel_shutdown":
                    try {
                        await invoke("system_cancel_shutdown");
                        result = { status: "shutdown_cancelled" };
                    } catch (e: any) {
                        result = { status: "cancel_failed", error: e.message };
                    }
                    break;
                case "logout":
                    // Same as logoff (backend uses 'logout', we use 'logoff')
                    this.notifyEvent({ event: 'logout' });
                    try {
                        await invoke("system_logoff");
                        result = { status: "logged_out" };
                    } catch (e: any) {
                        console.error("Logout failed:", e);
                        result = { status: "logout_failed", error: e.message };
                    }
                    break;
                case "login":
                    // Trigger user login UI or session start
                    this.notifyEvent({ event: 'login', params: cmd.params });
                    result = { status: "login_prompt_shown" };
                    break;
                case "screenshot":
                    // Take screenshot (placeholder - needs screenshot implementation)
                    this.notifyEvent({ event: 'screenshot' });
                    console.log("Screenshot requested - feature pending");
                    result = { status: "screenshot_requested", note: "Feature pending implementation" };
                    break;
                default:
                    throw new Error(`Unknown command: ${cmd.command}`);
            }
            await this.ack(cmd.id, "SUCCEEDED", result);
        } catch (error: any) {
            console.error(`Command ${cmd.command} failed`, error);
            await this.ack(cmd.id, "FAILED", { error: error.message });
        }
    }

    private async ack(commandId: number, state: string, result: any = null) {
        try {
            await this.signedPost('/command/ack', {
                command_id: commandId,
                state: state,
                result: result
            });
        } catch (e) {
            console.error("Failed to send ACK", e);
        }
    }

    private async signedPost(path: string, body: any) {
        if (!this.pcId) throw new Error("No PC ID");

        // NEW: signRequest calls Rust which has the secret
        const { signature, timestamp, nonce } = await signRequest("POST", `/api${path}`, body);

        return apiClient.post(path, body, {
            headers: {
                'X-PC-ID': this.pcId.toString(),
                'X-Device-Signature': signature,
                'X-Device-Timestamp': timestamp,
                'X-Device-Nonce': nonce
            }
        });
    }

    /**
     * Force restart of the command service (e.g., after successful handshake)
     */
    async restart(): Promise<boolean> {
        console.log("[CommandService] Restarting...");
        this.stop();
        await new Promise(r => setTimeout(r, 500)); // Brief pause
        return this.start();
    }

    stop() {
        console.log("[CommandService] Stopping...");
        this.isRunning = false;
        this.setConnectionState('disconnected');
    }

    /**
     * Check if the service is running and connected
     */
    isConnected(): boolean {
        return this.isRunning && this.connectionState === 'connected';
    }

    /**
     * Get current PC ID (null if not registered)
     */
    getPcId(): number | null {
        return this.pcId;
    }
}

export const commandService = new CommandService();
export default commandService;

