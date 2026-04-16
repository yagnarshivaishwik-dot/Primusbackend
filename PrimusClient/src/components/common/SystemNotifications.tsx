import React from 'react';
import { X, AlertTriangle, CheckCircle, Info, AlertCircle } from 'lucide-react';
import { useSystemStore } from '../../stores/systemStore';

const SystemNotifications: React.FC = () => {
  const { notifications, removeNotification } = useSystemStore();

  if (notifications.length === 0) {
    return null;
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-success-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-warning-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-error-500" />;
      case 'info':
      default:
        return <Info className="w-5 h-5 text-primary-500" />;
    }
  };

  const getNotificationBorderColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'border-success-500/30';
      case 'warning':
        return 'border-warning-500/30';
      case 'error':
        return 'border-error-500/30';
      case 'info':
      default:
        return 'border-primary-500/30';
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50 space-y-3 max-w-sm">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`notification-enter bg-secondary-800/90 backdrop-blur-md border ${getNotificationBorderColor(
            notification.type
          )} rounded-lg p-4 shadow-lg animate-slide-in-right`}
        >
          <div className="flex items-start space-x-3">
            {getNotificationIcon(notification.type)}
            
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-white">
                {notification.title}
              </h4>
              <p className="text-sm text-secondary-300 mt-1">
                {notification.message}
              </p>
              <p className="text-xs text-secondary-500 mt-2">
                {notification.timestamp.toLocaleTimeString()}
              </p>
            </div>
            
            <button
              onClick={() => removeNotification(notification.id)}
              className="flex-shrink-0 text-secondary-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SystemNotifications;
