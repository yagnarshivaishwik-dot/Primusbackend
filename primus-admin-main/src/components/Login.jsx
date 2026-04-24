import React, { useState } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import { getApiBase, showToast } from '../utils/api';

const Login = ({ onLoginSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const base = getApiBase().replace(/\/$/, "");
            console.log('[Login] Using API base:', base);
            const formData = new FormData();
            formData.append('username', email);
            formData.append('password', password);

            const response = await axios.post(`${base}/api/auth/login`, formData);
            const { access_token } = response.data;

            localStorage.setItem('primus_jwt', access_token);
            onLoginSuccess();
        } catch (err) {
            console.error('[Login] Error:', err.response?.status, err.response?.data || err.message);
            const detail = err.response?.data?.detail || 'Invalid credentials';
            showToast(`Login failed: ${detail}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-gray-800 rounded-2xl shadow-2xl p-8 border border-gray-700">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">Primus Admin</h1>
                    <p className="text-gray-400">Enter your credentials to manage your cafe</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Email Address</label>
                        <input
                            type="email"
                            required
                            className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                            placeholder="admin@yourcafe.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
                        <input
                            type="password"
                            required
                            className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl shadow-lg hover:shadow-indigo-500/20 transition-all disabled:opacity-50"
                    >
                        {loading ? 'Logging in...' : 'Sign In'}
                    </button>
                </form>

                <div className="mt-8 text-center">
                    <p className="text-sm text-gray-500">
                        Need help? Contact <a href="mailto:support@primustech.in" className="text-indigo-400 hover:underline">support@primustech.in</a>
                    </p>
                </div>
            </div>
        </div>
    );
};

Login.propTypes = {
    onLoginSuccess: PropTypes.func.isRequired
};

export default Login;

