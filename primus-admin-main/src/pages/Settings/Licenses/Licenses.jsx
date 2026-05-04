import React, { useState, useEffect } from 'react';
import { showToast } from '../../../utils/api';
import { settingsAPI, settingsToObject } from '../../../utils/settings.js';
import LicenseModal from './LicenseModal.jsx';

function Licenses() {
    const [show, setShow] = useState(false);
    const [licensePools, setLicensePools] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(null);

    useEffect(() => {
        loadLicensePools();
    }, []);

    const loadLicensePools = async () => {
        try {
            const settings = await settingsAPI.getSettingsByCategory('licenses');
            const settingsObj = settingsToObject(settings);
            const pools = settingsObj.license_pools || [];
            setLicensePools(Array.isArray(pools) ? pools : []);
        } catch (error) {
            showToast('Failed to load license pools', 'error');
            setLicensePools([]);
        } finally {
            setLoading(false);
        }
    };

    const saveLicensePools = async (pools) => {
        try {
            const settingsToUpdate = [{
                category: 'licenses',
                key: 'license_pools',
                value: JSON.stringify(pools),
                value_type: 'json'
            }];
            await settingsAPI.bulkUpdateSettings(settingsToUpdate);
            setLicensePools(pools);
            showToast('License pools updated successfully', 'success');
        } catch (error) {
            showToast('Failed to save license pools', 'error');
        }
    };

    const handleCreatePool = async (poolData) => {
        const newPool = {
            id: Date.now(), // Simple ID generation
            name: poolData.name,
            games: poolData.games,
            created_at: new Date().toISOString(),
            active: true
        };

        const updatedPools = [...licensePools, newPool];
        await saveLicensePools(updatedPools);
        setShow(false);
    };

    const handleDeletePool = async (poolId) => {
        setDeleting(poolId);
        try {
            const updatedPools = licensePools.filter(pool => pool.id !== poolId);
            await saveLicensePools(updatedPools);
        } catch (error) {
            showToast('Failed to delete license pool', 'error');
        } finally {
            setDeleting(null);
        }
    };

    const togglePoolStatus = async (poolId) => {
        const updatedPools = licensePools.map(pool =>
            pool.id === poolId ? { ...pool, active: !pool.active } : pool
        );
        await saveLicensePools(updatedPools);
    };

    if (loading) {
        return (
            <div className='text-xl text-white font-semibold mb-4'>
                Center/Licenses
                <div className='text-gray-400 text-sm mt-2'>Loading license pools...</div>
            </div>
        );
    }

    return (
        <div>
            <div className='text-xl text-white font-semibold mb-4'>Center/Licenses</div>

            <div className='card-animated p-4 mb-4'>
                <div className='flex items-center justify-between mb-4'>
                    <div>
                        <div className='text-gray-300 text-sm'>License Pools</div>
                        <div className='text-gray-500 text-xs mt-1'>
                            Manage license pools for different games and applications
                        </div>
                    </div>
                    <button
                        className='btn-primary-neo px-3 py-1.5 rounded-md'
                        onClick={() => setShow(true)}
                    >
                        Create license pool
                    </button>
                </div>

                {licensePools.length === 0 ? (
                    <div className='text-gray-400 text-center py-8'>
                        No license pools created yet. Click &quot;Create license pool&quot; to get started.
                    </div>
                ) : (
                    <div className='space-y-3'>
                        {licensePools.map((pool) => (
                            <div key={pool.id} className='border border-white/10 rounded-md p-4'>
                                <div className='flex items-center justify-between'>
                                    <div className='flex-1'>
                                        <div className='flex items-center gap-3'>
                                            <div className='text-white font-medium'>{pool.name}</div>
                                            <div className={`px-2 py-1 rounded text-xs ${pool.active ? 'bg-green-600/20 text-green-400' : 'bg-gray-600/20 text-gray-400'
                                                }`}>
                                                {pool.active ? 'Active' : 'Inactive'}
                                            </div>
                                        </div>
                                        <div className='text-gray-400 text-sm mt-1'>
                                            {pool.games?.length || 0} games • Created {new Date(pool.created_at).toLocaleDateString()}
                                        </div>
                                        {pool.games && pool.games.length > 0 && (
                                            <div className='flex flex-wrap gap-1 mt-2'>
                                                {pool.games.slice(0, 5).map((game, index) => (
                                                    <span key={index} className='text-xs bg-white/10 px-2 py-1 rounded'>
                                                        {game}
                                                    </span>
                                                ))}
                                                {pool.games.length > 5 && (
                                                    <span className='text-xs text-gray-500 px-2 py-1'>
                                                        +{pool.games.length - 5} more
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className='flex items-center gap-2'>
                                        <button
                                            className={`pill text-xs ${pool.active ? 'bg-gray-600 hover:bg-gray-500' : 'bg-green-600 hover:bg-green-700'
                                                }`}
                                            onClick={() => togglePoolStatus(pool.id)}
                                        >
                                            {pool.active ? 'Deactivate' : 'Activate'}
                                        </button>
                                        <button
                                            className='pill bg-red-600 hover:bg-red-700 text-xs'
                                            onClick={() => handleDeletePool(pool.id)}
                                            disabled={deleting === pool.id}
                                        >
                                            {deleting === pool.id ? 'Deleting...' : 'Delete'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* License Statistics */}
            <div className='grid grid-cols-1 lg:grid-cols-3 gap-4'>
                <div className='card-animated p-4 text-center'>
                    <div className='text-2xl mb-2'>🎮</div>
                    <div className='text-white text-lg font-semibold'>{licensePools.length}</div>
                    <div className='text-gray-400 text-sm'>Total Pools</div>
                </div>
                <div className='card-animated p-4 text-center'>
                    <div className='text-2xl mb-2'>✅</div>
                    <div className='text-white text-lg font-semibold'>
                        {licensePools.filter(p => p.active).length}
                    </div>
                    <div className='text-gray-400 text-sm'>Active Pools</div>
                </div>
                <div className='card-animated p-4 text-center'>
                    <div className='text-2xl mb-2'>🎯</div>
                    <div className='text-white text-lg font-semibold'>
                        {licensePools.reduce((total, pool) => total + (pool.games?.length || 0), 0)}
                    </div>
                    <div className='text-gray-400 text-sm'>Games Covered</div>
                </div>
            </div>

            {show && <LicenseModal onClose={() => setShow(false)} onCreate={handleCreatePool} />}
        </div>
    );
}

export default Licenses;
