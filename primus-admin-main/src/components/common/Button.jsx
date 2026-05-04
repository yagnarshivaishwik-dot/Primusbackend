import React from 'react';
import PropTypes from 'prop-types';

const Button = ({ children, onClick, className = '', variant = 'primary', disabled = false }) => {
    const baseClasses = 'px-4 py-2 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center space-x-2 shadow-md';
    const variants = {
        primary: 'bg-indigo-600 text-white hover:bg-indigo-500 focus:ring-4 focus:ring-indigo-500/50',
        secondary: 'bg-gray-700 text-gray-200 hover:bg-gray-600 focus:ring-4 focus:ring-gray-600/50',
        danger: 'bg-red-600 text-white hover:bg-red-500 focus:ring-4 focus:ring-red-500/50',
    };
    return (
        <button onClick={onClick} disabled={disabled} className={`${baseClasses} ${variants[variant]} ${className}`}>
            {children}
        </button>
    );
};

Button.propTypes = {
    children: PropTypes.node.isRequired,
    onClick: PropTypes.func,
    className: PropTypes.string,
    variant: PropTypes.oneOf(['primary', 'secondary', 'danger']),
    disabled: PropTypes.bool
};

export default Button;
