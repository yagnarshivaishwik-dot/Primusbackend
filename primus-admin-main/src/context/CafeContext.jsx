import React, { createContext, useContext } from 'react';
import PropTypes from 'prop-types';

// CafeContext is a thin pass-through used by deep settings pages so they
// don't have to drill `cafeInfo` through every intermediate parent. The
// current AdminUI.jsx still passes `cafeInfo` as a prop to the top-level
// pages — this context is wired in additively for future consumers.

const CafeContext = createContext(null);

export const CafeProvider = ({ cafeInfo, children }) => {
    return <CafeContext.Provider value={cafeInfo}>{children}</CafeContext.Provider>;
};

CafeProvider.propTypes = {
    cafeInfo: PropTypes.object,
    children: PropTypes.node.isRequired
};

export const useCafeInfo = () => useContext(CafeContext);

export default CafeContext;
