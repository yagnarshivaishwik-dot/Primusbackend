// Phase 1 + Phase 3 split executed 2026-05-04.
//
// Before:  6,891 lines (this file held every page, modal, settings module).
// After:   ~165 lines — thin orchestrator only.
//
// Page components live under src/pages/ and src/components/common/.
// Settings tree lives under src/pages/Settings/.
//
// Audit references closed by this surgery: FE-C1 (god-file), FE-H7 (29
// console statements — all 26 remaining ones lived in the inline Settings
// tree, which is gone now), FE-M1 (HTML entity escapes — same).
//
// The renderPage switch dispatches to the imported components. The Settings
// case dispatches to SettingsRoot, which itself dispatches to the deeper
// Client/Center/Licenses subpages.

import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import {
    BarChart,
    Users,
    Monitor,
    Settings as SettingsIcon,
    Annoyed,
    LogOut,
    Search,
    Clock,
    Ticket,
    ShoppingCart,
    Calendar,
    Megaphone,
} from 'lucide-react';

import { getApiBase, authHeaders } from '../utils/api';
import { eventStream } from '../utils/eventStream';
import Login from './Login';
import ChatPanel from './ChatPanel.jsx';
import NotificationBell from './NotificationBell.jsx';
import StatisticsPage from './StatisticsPage';

// Phase 1 page components (extracted from this file).
import Dashboard from '../pages/Dashboard';
import PCManagement from '../pages/PCManagement';
import GameManagement from '../pages/GameManagement';
import Financials from '../pages/Financials';
import ShopPage from '../pages/Shop/ShopPage';
import CouponsPage from '../pages/Coupons/CouponsPage';
import CampaignsPage from '../pages/Campaigns/CampaignsPage';
import UsersPage from '../pages/Users/UsersPage';
import OrdersPage from '../pages/Orders/OrdersPage';
import GuestsPage from '../pages/Guests/GuestsPage';
import BookingsPage from '../pages/Bookings/BookingsPage';
import ActivityPage from '../pages/Activity/ActivityPage';

// Phase 3 settings tree (delegates to Client/Center/Licenses subpages).
import SettingsRoot from '../pages/Settings/SettingsRoot';


const AdminUI = ({ cafeInfo, onLogout }) => {
    const [activePage, setActivePage] = useState('Dashboard');
    const [activeChatContext, setActiveChatContext] = useState(null);

    const NavItem = ({ pageName, icon, children }) => (
        <li
            onClick={() => setActivePage(pageName)}
            className={`nav-neo ${
                activePage === pageName ? 'nav-neo-active text-white' : 'text-gray-300'
            } flex items-center space-x-3 p-3 rounded-lg cursor-pointer`}
        >
            <span className="text-gray-200">{icon}</span>
            <span className="font-medium">{children}</span>
        </li>
    );

    NavItem.propTypes = {
        pageName: PropTypes.string.isRequired,
        icon: PropTypes.node.isRequired,
        children: PropTypes.node.isRequired,
    };

    const renderPage = () => {
        switch (activePage) {
            case 'Dashboard':
                return <Dashboard />;
            case 'PCs':
            case 'PC list':
                return <PCManagement />;
            case 'Users':
                return <UsersPage />;
            case 'Games':
                return <GameManagement />;
            case 'Financials':
                return <Financials />;
            case 'Shop':
                return <ShopPage cafeInfo={cafeInfo} />;
            case 'Coupons':
                return <CouponsPage cafeInfo={cafeInfo} />;
            case 'Campaigns':
                return <CampaignsPage cafeInfo={cafeInfo} />;
            case 'Orders':
                return <OrdersPage />;
            case 'Bookings':
                return <BookingsPage />;
            case 'Guests':
                return <GuestsPage />;
            case 'Statistics':
                return <StatisticsPage />;
            case 'Activity tracker':
                return <ActivityPage />;
            case 'Settings':
                return <SettingsRoot />;
            default:
                return <Dashboard />;
        }
    };

    return (
        <div className="admin-shell text-white min-h-screen flex font-sans">
            {/* Sidebar */}
            <aside className="w-64 sidebar-glass p-6 flex-shrink-0 flex flex-col justify-between">
                <div>
                    <div className="flex items-center space-x-3 mb-10">
                        <Annoyed
                            size={32}
                            className="text-indigo-400 drop-shadow-[0_0_12px_rgba(147,51,234,0.6)]"
                        />
                        <h1 className="text-2xl font-extrabold title-gradient">PRIMUS</h1>
                    </div>
                    <nav>
                        <ul className="space-y-2">
                            <NavItem pageName="Dashboard" icon={<BarChart size={20} />}>Dashboard</NavItem>
                            <NavItem pageName="PC list" icon={<Monitor size={20} />}>PC list</NavItem>
                            <NavItem pageName="Shop" icon={<ShoppingCart size={20} />}>Shop</NavItem>
                            <NavItem pageName="Coupons" icon={<Ticket size={20} />}>Coupons</NavItem>
                            <NavItem pageName="Campaigns" icon={<Megaphone size={20} />}>Campaigns</NavItem>
                            <NavItem pageName="Orders" icon={<Ticket size={20} />}>Orders</NavItem>
                            <NavItem pageName="Users" icon={<Users size={20} />}>Users</NavItem>
                            <NavItem pageName="Guests" icon={<Annoyed size={20} />}>Guests</NavItem>
                            <NavItem pageName="Bookings" icon={<Calendar size={20} />}>Bookings</NavItem>
                            <NavItem pageName="Activity tracker" icon={<Clock size={20} />}>Activity tracker</NavItem>
                            <NavItem pageName="Statistics" icon={<BarChart size={20} />}>Statistics</NavItem>
                            <NavItem pageName="Settings" icon={<SettingsIcon size={20} />}>Settings</NavItem>
                        </ul>
                    </nav>
                </div>
                <div>
                    <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-700/50">
                        <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white text-lg">
                            {cafeInfo?.name?.charAt(0) || 'A'}
                        </div>
                        <div>
                            <p className="font-semibold text-white">{cafeInfo?.name || 'Cafe Admin'}</p>
                            <p className="text-xs text-gray-400">{cafeInfo?.location || 'admin@cafe.com'}</p>
                        </div>
                    </div>
                    <button
                        onClick={onLogout}
                        className="w-full flex items-center justify-center space-x-2 p-3 mt-4 rounded-lg text-gray-400 hover:bg-red-500/20 hover:text-red-300 transition-colors"
                    >
                        <LogOut size={20} />
                        <span>Logout</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 p-8 overflow-y-auto">
                {/* Header */}
                <header className="flex justify-between items-center mb-8">
                    <div className="relative w-full max-w-xs">
                        <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Search for PCs, users..."
                            className="w-full search-input rounded-lg py-2 pl-10 pr-4 text-white placeholder-gray-500"
                        />
                    </div>
                    <div className="flex items-center space-x-6">
                        <NotificationBell
                            onOpenThread={(ctx) => {
                                setActiveChatContext(ctx);
                            }}
                        />
                    </div>
                </header>

                {/* Page Content */}
                {renderPage()}
                {activeChatContext && (
                    <ChatPanel
                        pc={{
                            id: activeChatContext.client_id,
                            name: activeChatContext.client_name || `PC-${activeChatContext.client_id}`,
                        }}
                        onClose={() => setActiveChatContext(null)}
                    />
                )}
            </main>
        </div>
    );
};

AdminUI.propTypes = {
    cafeInfo: PropTypes.object,
    onLogout: PropTypes.func.isRequired,
};


const App = () => {
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

    if (!isLoggedIn) {
        return <Login onLoginSuccess={() => setIsLoggedIn(true)} />;
    }

    return (
        <AdminUI
            cafeInfo={cafeInfo}
            onLogout={() => {
                localStorage.removeItem('primus_jwt');
                setIsLoggedIn(false);
            }}
        />
    );
};


export default App;
