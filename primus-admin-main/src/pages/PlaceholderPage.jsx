import React from 'react';
import PropTypes from 'prop-types';

// Placeholder component for settings pages that aren't implemented yet
function PlaceholderPage({ title }) {
    return (
        <div className="text-center py-16">
            <div className="text-xl text-white font-semibold mb-4">{title}</div>
            <div className="text-gray-400 mb-6">This settings page is ready to be configured.</div>
            <div className="text-gray-500 text-sm">Let me know what settings you&apos;d like to add to this section!</div>
        </div>
    );
}

PlaceholderPage.propTypes = {
    title: PropTypes.string.isRequired
};

export default PlaceholderPage;
