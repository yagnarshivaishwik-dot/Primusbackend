import React from 'react';
import PropTypes from 'prop-types';

const StatCard = ({ title, value, icon, color }) => (
    <div className="bg-gray-800 p-6 rounded-xl flex items-center space-x-4 shadow-lg">
        <div className={`p-3 rounded-full ${color}`}>
            {icon}
        </div>
        <div>
            <p className="text-sm text-gray-400">{title}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
        </div>
    </div>
);

StatCard.propTypes = {
    title: PropTypes.string.isRequired,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    icon: PropTypes.node.isRequired,
    color: PropTypes.string.isRequired
};

export default StatCard;
