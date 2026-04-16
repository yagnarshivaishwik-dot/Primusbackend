import React, { useState } from 'react';
import { invoke } from '../../utils/invoke';
import { Settings } from 'lucide-react';
import toast from 'react-hot-toast';

const KioskControls: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);

  const enableCompleteKiosk = async () => {
    setIsLoading(true);
    try {
      await invoke<string>('setup_complete_kiosk');
      toast.success('Kiosk mode enabled! Restart required.');
    } catch (error: any) {
      toast.error('Failed to enable kiosk mode. Please run as Administrator.');
    } finally {
      setIsLoading(false);
    }
  };

  const disableKiosk = async () => {
    setIsLoading(true);
    try {
      await invoke<string>('disable_kiosk_mode');
      toast.success('Kiosk mode disabled! Restart required.');
    } catch (error: any) {
      toast.error('Failed to disable kiosk mode. Please run as Administrator.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-secondary-800/90 backdrop-blur-md rounded-lg p-4 border border-secondary-700">
        <div className="flex items-center space-x-3">
          <Settings className="w-5 h-5 text-primary-400" />
          <span className="text-sm font-medium">Kiosk Mode</span>

          <button
            onClick={enableCompleteKiosk}
            disabled={isLoading}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded disabled:bg-gray-600"
          >
            Enable
          </button>

          <button
            onClick={disableKiosk}
            disabled={isLoading}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded disabled:bg-gray-600"
          >
            Disable
          </button>
        </div>
      </div>
    </div>
  );
};

export default KioskControls;
