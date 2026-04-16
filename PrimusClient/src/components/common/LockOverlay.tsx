import React from 'react';
import { Lock } from 'lucide-react';
import { useSystemStore } from '../../stores/systemStore';

const LockOverlay: React.FC = () => {
  const { isLocked, lockMessage } = useSystemStore();

  if (!isLocked) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      style={{ pointerEvents: 'auto' }}
    >
      <div className="max-w-xl mx-4 p-8 rounded-2xl bg-secondary-900/90 border border-secondary-700 shadow-2xl text-center">
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg">
            <Lock className="w-9 h-9 text-white" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">
          PC Locked
        </h2>
        <p className="text-secondary-300 text-lg">
          {lockMessage || 'This PC has been locked by the administrator. Please contact the front desk for assistance.'}
        </p>
      </div>
    </div>
  );
};

export default LockOverlay;


