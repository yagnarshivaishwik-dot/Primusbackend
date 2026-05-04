import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import { getApiBase, authHeaders } from '../utils/api';
import { eventStream } from '../utils/eventStream';

// AuthContext owns login state and the cafe-info fetch lifecycle that the
// inline `App` wrapper inside AdminUI.jsx currently manages directly.
// This context is purely additive — the existing prop-passing path keeps
// working until consumers migrate.

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('primus_jwt'));
    const [cafeInfo, setCafeInfo] = useState(null);

    const fetchCafeInfo = useCallback(async () => {
        try {
            const base = getApiBase().replace(/\/$/, '');
            const r = await axios.get(`${base}/api/cafe/mine`, { headers: authHeaders() });
            setCafeInfo(r.data);
        } catch (e) {
            if (e.response?.status === 401) {
                localStorage.removeItem('primus_jwt');
                setIsLoggedIn(false);
            }
        }
    }, []);

    useEffect(() => {
        if (isLoggedIn) {
            fetchCafeInfo();
            eventStream.connect();
        } else {
            eventStream.disconnect();
        }
        return () => eventStream.disconnect();
    }, [isLoggedIn, fetchCafeInfo]);

    const logout = useCallback(() => {
        localStorage.removeItem('primus_jwt');
        setIsLoggedIn(false);
    }, []);

    const login = useCallback(() => {
        setIsLoggedIn(true);
    }, []);

    const value = {
        isLoggedIn,
        cafeInfo,
        fetchCafeInfo,
        login,
        logout
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

AuthProvider.propTypes = {
    children: PropTypes.node.isRequired
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuth must be used inside <AuthProvider>');
    }
    return ctx;
};

export default AuthContext;
