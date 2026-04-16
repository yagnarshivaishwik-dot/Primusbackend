import React from 'react';
import { Loader2, Gamepad2 } from 'lucide-react';

interface LoadingScreenProps {
  message?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ 
  message = 'Loading...' 
}) => {
  return (
    <div className="loading-overlay">
      <div className="text-center">
        {/* Logo Animation */}
        <div className="relative mb-8">
          <div className="w-24 h-24 mx-auto bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center animate-pulse-slow">
            <Gamepad2 className="w-12 h-12 text-white" />
          </div>
          <div className="absolute inset-0 w-24 h-24 mx-auto border-4 border-primary-500/30 rounded-full animate-spin"></div>
        </div>

        {/* Loading Spinner */}
        <div className="flex items-center justify-center mb-6">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin mr-3" />
          <span className="text-xl font-semibold text-secondary-100">
            {message}
          </span>
        </div>

        {/* Progress Dots */}
        <div className="flex justify-center space-x-2">
          <div className="w-3 h-3 bg-primary-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
          <div className="w-3 h-3 bg-primary-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
          <div className="w-3 h-3 bg-primary-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
        </div>

        {/* System Info */}
        <div className="mt-12 text-sm text-secondary-400">
          <p>Primus Gaming Cafe Client</p>
          <p className="text-xs mt-1">Version 1.0.0</p>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;
