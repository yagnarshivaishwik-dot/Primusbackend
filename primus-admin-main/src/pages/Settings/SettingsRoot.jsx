import React, { useState } from 'react';
import PlaceholderPage from '../PlaceholderPage.jsx';

// Center config pages (this agent's scope)
import CenterFinancial from './Center/CenterFinancial.jsx';
import CenterReports from './Center/CenterReports.jsx';
import CenterInfo from './Center/CenterInfo.jsx';
import CenterNetwork from './Center/CenterNetwork.jsx';
import CenterLanguage from './Center/CenterLanguage.jsx';
import UserDetails from './UserDetails.jsx';
import Licenses from './Licenses/Licenses.jsx';

// Client configuration pages (other agent's scope — landing in src/pages/Settings/Client/)
import ClientGeneral from './Client/ClientGeneral.jsx';
import ClientVersion from './Client/ClientVersion.jsx';
import ClientConsoles from './Client/ClientConsoles.jsx';
import ClientCustomization from './Client/ClientCustomization.jsx';
import ClientAdvanced from './Client/ClientAdvanced.jsx';
import ClientSecurity from './Client/ClientSecurity.jsx';
import ClientGamesApps from './Client/ClientGamesApps.jsx';

function SettingsRoot() {
    const menu = [
        {
            key: 'center', label: 'Center config', items: [
                { key: 'financial', label: 'Financial configuration' },
                { key: 'reports', label: 'Report configuration' },
                { key: 'info', label: 'Center information' },
                { key: 'network', label: 'Center network' },
                { key: 'user-fields', label: 'User details configuration' },
                { key: 'licenses', label: 'Licenses' },
                { key: 'language', label: 'Language' },
            ]
        },
        {
            key: 'client', label: 'Client configuration', items: [
                { key: 'billing', label: 'Billing information' },
                { key: 'general', label: 'General settings' },
                { key: 'version', label: 'Version' },
                { key: 'consoles', label: 'Consoles' },
                { key: 'homescreen', label: 'Home screen' },
                { key: 'customization', label: 'Customization' },
                { key: 'advanced', label: 'Advanced' },
                { key: 'security', label: 'Security' },
                { key: 'games-apps', label: 'Games/apps' },
                { key: 'terms', label: 'Terms and conditions' },
                { key: 'discord', label: 'Discord configuration' },
            ]
        },
        { key: 'shop', label: 'Shop settings', items: [] },
        { key: 'groups', label: 'Groups config', items: [] },
        { key: 'employees', label: 'Employees', items: [] },
        { key: 'loyalty', label: 'Loyalty system', items: [] },
        { key: 'players', label: 'Players web portal', items: [] },
        { key: 'exports', label: 'Exports' },
        { key: 'bookings', label: 'Bookings' },
        { key: 'webadmin', label: 'Web-admin settings' },
        { key: 'notifications', label: 'Player notifications' },
        { key: 'subscription', label: 'Subscription management' },
        { key: 'userlogin', label: 'User login' },
        { key: 'integrations', label: 'Integrations' },
        { key: 'api', label: 'API', items: [] },
        { key: 'account', label: 'Account' },
        { key: 'marketplace', label: 'Add-Ons Marketplace' },
    ];
    const [active, setActive] = useState('center:financial');
    const [hover, setHover] = useState(null); // current hovered section key
    const [pinned, setPinned] = useState(null); // keep submenu open until changed

    const renderRight = () => {
        const [group, page] = active.split(':');
        // Center config pages
        if (group === 'center' && page === 'financial') return <CenterFinancial />;
        if (group === 'center' && page === 'reports') return <CenterReports />;
        if (group === 'center' && page === 'info') return <CenterInfo />;
        if (group === 'center' && page === 'network') return <CenterNetwork />;
        if (group === 'center' && page === 'user-fields') return <UserDetails />;
        if (group === 'center' && page === 'licenses') return <Licenses />;
        if (group === 'center' && page === 'language') return <CenterLanguage />;

        // Client configuration pages
        if (group === 'client' && page === 'billing') return <PlaceholderPage title='Client/Billing information' />;
        if (group === 'client' && page === 'general') return <ClientGeneral />;
        if (group === 'client' && page === 'version') return <ClientVersion />;
        if (group === 'client' && page === 'consoles') return <ClientConsoles />;
        if (group === 'client' && page === 'homescreen') return <PlaceholderPage title='Client/Home screen' />;
        if (group === 'client' && page === 'customization') return <ClientCustomization />;
        if (group === 'client' && page === 'advanced') return <ClientAdvanced />;
        if (group === 'client' && page === 'security') return <ClientSecurity />;
        if (group === 'client' && page === 'games-apps') return <ClientGamesApps />;
        if (group === 'client' && page === 'terms') return <PlaceholderPage title='Client/Terms and conditions' />;
        if (group === 'client' && page === 'discord') return <PlaceholderPage title='Client/Discord configuration' />;

        // Other main sections
        if (active === 'shop') return <PlaceholderPage title='Shop settings' />;
        if (active === 'groups') return <PlaceholderPage title='Groups config' />;
        if (active === 'employees') return <PlaceholderPage title='Employees' />;
        if (active === 'loyalty') return <PlaceholderPage title='Loyalty system' />;
        if (active === 'players') return <PlaceholderPage title='Players web portal' />;
        if (active === 'exports') return <PlaceholderPage title='Exports' />;
        if (active === 'bookings') return <PlaceholderPage title='Bookings' />;
        if (active === 'webadmin') return <PlaceholderPage title='Web-admin settings' />;
        if (active === 'notifications') return <PlaceholderPage title='Player notifications' />;
        if (active === 'subscription') return <PlaceholderPage title='Subscription management' />;
        if (active === 'userlogin') return <PlaceholderPage title='User login' />;
        if (active === 'integrations') return <PlaceholderPage title='Integrations' />;
        if (active === 'api') return <PlaceholderPage title='API' />;
        if (active === 'account') return <PlaceholderPage title='Account' />;
        if (active === 'marketplace') return <PlaceholderPage title='Add-Ons Marketplace' />;

        return <div className='text-gray-400'>Select a settings page</div>;
    };

    return (
        <div className='flex'>
            {/* Left menu */}
            <div className='w-64 border-r border-white/10 pr-2'>
                <div className='text-2xl font-semibold text-white mb-4'>Settings</div>
                {menu.map(section => (
                    <div
                        key={section.key}
                        className='relative'
                        onMouseEnter={() => setHover(section.key)}
                        onMouseLeave={() => { if (pinned !== section.key) setHover(null); }}
                    >
                        <button
                            onClick={() => {
                                if (section.items && section.items.length > 0) {
                                    // Has submenu - toggle pinned state
                                    if (pinned === section.key) {
                                        setPinned(null);
                                        setHover(null);
                                    } else {
                                        setPinned(section.key);
                                        setHover(section.key);
                                    }
                                } else {
                                    // No submenu - directly activate this page
                                    setActive(section.key);
                                    setPinned(null);
                                    setHover(null);
                                }
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-md ${active === section.key || active.startsWith(section.key + ':') ? 'nav-neo-active' : 'nav-neo'}`}
                        >
                            <span>{section.label}</span>
                            {section.items && <span>▸</span>}
                        </button>
                        {section.items && ((hover === section.key) || (pinned === section.key)) && (
                            <div
                                className='absolute left-full top-0 ml-2 w-72 calendar-pop z-50'
                                onMouseEnter={() => setHover(section.key)}
                                onMouseLeave={() => { if (pinned !== section.key) setHover(null); }}
                            >
                                {section.items.map(item => (
                                    <button
                                        key={item.key}
                                        className={`w-full text-left px-3 py-2 rounded-md ${active === `${section.key}:${item.key}` ? 'pill-active' : 'pill'}`}
                                        onClick={() => {
                                            setActive(`${section.key}:${item.key}`);
                                            setPinned(section.key);
                                        }}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
            {/* Right content */}
            <div className='flex-1 pl-6'>
                {renderRight()}
            </div>
        </div>
    );
}

export default SettingsRoot;
