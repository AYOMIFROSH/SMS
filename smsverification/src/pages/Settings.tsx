import React from 'react';
import { Key, Bell } from 'lucide-react';

export const Settings: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Manage your account preferences and security settings.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* API Settings */}
        <div className="card">
          <div className="flex items-center mb-4">
            <Key className="h-5 w-5 text-gray-600 mr-2" />
            <h3 className="text-lg font-medium text-gray-900">API Settings</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                SMS-Activate API Key
              </label>
              <input
                type="password"
                placeholder="Enter your API key"
                className="input-field"
              />
              <p className="mt-1 text-xs text-gray-500">
                Get your API key from SMS-Activate.io
              </p>
            </div>
            <button className="btn-primary">
              Save API Key
            </button>
          </div>
        </div>

        {/* Notifications */}
        <div className="card">
          <div className="flex items-center mb-4">
            <Bell className="h-5 w-5 text-gray-600 mr-2" />
            <h3 className="text-lg font-medium text-gray-900">Notifications</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">SMS Received</p>
                <p className="text-xs text-gray-500">Get notified when SMS is received</p>
              </div>
              <input type="checkbox" className="rounded" defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Low Balance</p>
                <p className="text-xs text-gray-500">Alert when balance is low</p>
              </div>
              <input type="checkbox" className="rounded" defaultChecked />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

