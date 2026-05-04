import React from 'react';

const Dashboard = () => {
    return (
        <div>
            {/* Top row with title and buttons */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5 text-gray-200"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                    </div>
                    <h1 className="text-xl font-semibold text-white">Homepage</h1>
                </div>
                <div className="flex items-center gap-2">
                    <button className="px-3 py-1.5 text-sm rounded-md btn-ghost">Edit dashboard</button>
                    <button className="px-3 py-1.5 text-sm rounded-md btn-primary-neo">Add widget</button>
                </div>
            </div>

            {/* Widgets grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Center feed */}
                <div className="card-animated p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-gray-200 font-semibold">Center feed</h2>
                        <button className="text-gray-400 hover:text-white">⋮</button>
                    </div>
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-8 h-8 text-gray-300"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3" /></svg>
                        </div>
                        <p className="text-gray-300 font-semibold">No activity yet</p>
                        <p className="text-gray-500 text-sm mt-1">There is no activity in the center yet for today, click the button below to view previous days.</p>
                        <button className="mt-4 px-4 py-2 text-sm rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 border border-gray-600">View full activity tracker</button>
                    </div>
                </div>

                {/* Upcoming reservations */}
                <div className="card-animated p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-gray-200 font-semibold">Upcoming reservations</h2>
                        <div className="flex items-center gap-2">
                            <button className="px-3 py-1 text-xs rounded-md bg-gray-700 text-gray-200">Today</button>
                            <button className="px-3 py-1 text-xs rounded-md bg-gray-700 text-gray-200">Tomorrow</button>
                        </div>
                    </div>
                    <div className="flex items-center justify-center h-48">
                        <div className="w-10 h-10 rounded-full border-2 border-gray-600 border-t-transparent animate-spin"></div>
                    </div>
                </div>

                {/* Device dashboard */}
                <div className="card-animated p-6">
                    <h2 className="text-gray-200 font-semibold mb-2">Device dashboard</h2>
                    <div className="h-48 bg-gray-700/30 rounded-lg"></div>
                </div>

                {/* User time status */}
                <div className="card-animated p-6">
                    <h2 className="text-gray-200 font-semibold mb-2">User time status</h2>
                    <div className="flex flex-col items-center justify-center h-48 text-center">
                        <div className="relative">
                            <div className="w-14 h-14 rounded-full border-2 border-gray-600 border-t-transparent animate-spin"></div>
                            <span className="absolute inset-0 flex items-center justify-center text-gray-300">😊</span>
                        </div>
                        <p className="text-gray-500 text-sm mt-4">No users logged in right now</p>
                        <div className="mt-3 flex items-center gap-2">
                            <button className="px-3 py-1.5 text-xs rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600">Log in user</button>
                            <button className="px-3 py-1.5 text-xs rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600">Log in guest</button>
                        </div>
                    </div>
                </div>

                {/* News Feed full width */}
                <div className="lg:col-span-2 card-animated p-6">
                    <h2 className="text-gray-200 font-semibold mb-2">News Feed</h2>
                    <div className="h-32 bg-gray-700/30 rounded-lg"></div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
