import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { getApiBase, authHeaders, showToast } from '../../utils/api';

const ImportUsersModal = ({ onClose, onImported }) => {
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const upload = async () => {
        if (!file) return;
        try {
            setBusy(true);
            const base = getApiBase().replace(/\/$/, '');
            const fd = new FormData();
            fd.append('file', file);
            const r = await fetch(`${base}/api/user/import`, { method: 'POST', headers: authHeaders(), body: fd });
            const j = await r.json().catch(() => null);
            onImported && onImported(j || { created: 0 });
        } catch { showToast('Import failed'); } finally { setBusy(false); }
    };
    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-xl" style={{ background: '#1a1d21', border: '1px solid #2a2d31' }}>
                <div className="p-4 border-b border-white/10 flex items-center justify-between"><h3 className="text-white font-semibold">Import users</h3><button onClick={onClose} className="text-gray-400 hover:text-white">✕</button></div>
                <div className="p-4 space-y-3">
                    <div className="text-sm text-gray-300">Upload a .CSV with headers: username,email,password,first_name,last_name,phone,role</div>
                    <input type="file" accept=".csv" onChange={e => setFile(e.target.files?.[0] || null)} className="text-gray-200" />
                </div>
                <div className="p-4 border-t border-white/10 flex items-center justify-end gap-2">
                    <button className="pill" onClick={onClose}>Cancel</button>
                    <button className="btn-primary-neo px-4 py-2 rounded-md" disabled={!file || busy} onClick={upload}>{busy ? 'Uploading...' : 'Import'}</button>
                </div>
            </div>
        </div>
    );
};

ImportUsersModal.propTypes = {
    onClose: PropTypes.func.isRequired,
    onImported: PropTypes.func
};

export default ImportUsersModal;
