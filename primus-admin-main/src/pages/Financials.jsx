import React from 'react';
import { Package, DollarSign } from 'lucide-react';

const Financials = () => (
    <div>
        <h1 className="text-3xl font-bold text-white mb-6">Financials</h1>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700/50">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center"><Package className="mr-3 text-indigo-400" /> Offers &amp; Packages</h2>
                <div className="text-gray-400 text-sm">
                    No offers loaded. Configure membership packages and offers in the backend.
                </div>
            </div>
            <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700/50">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center"><DollarSign className="mr-3 text-indigo-400" /> Pricing Rules</h2>
                <div className="text-gray-400 text-sm">
                    Pricing rule management coming soon. No demo pricing data is displayed.
                </div>
            </div>
        </div>
    </div>
);

export default Financials;
