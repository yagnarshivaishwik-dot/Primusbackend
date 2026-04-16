import { invoke } from "@tauri-apps/api/tauri";

/**
 * MASTER SYSTEM: Client-side HMAC signing utility.
 * Matches backend verify_device_signature logic.
 */
export async function signRequest(
    method: string,
    path: string,
    body: any
) {
    const bodyStr = body ? JSON.stringify(body) : "";

    // Call Secure Rust API with method and path for proper signature
    // Returns: { pc_id, timestamp, nonce, signature }
    const signedData = await invoke<any>("sign_request", {
        method: method.toUpperCase(),
        path: path,
        payload: bodyStr
    });

    return {
        signature: signedData.signature,
        timestamp: signedData.timestamp,
        nonce: signedData.nonce,
        // sign_request also returns pc_id, which we might need to send
        pcId: signedData.pc_id
    };
}

