// src/pages/ActiveNumbers.tsx
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '@/store/store';
import { fetchActiveNumbers, cancelNumber, completeNumber } from '@/store/slices/numbersSlice';
import NumberCard from '@/components/numbers/NumberCards';
import { RefreshCw, Smartphone, AlertCircle } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const ActiveNumbers: React.FC = () => {
  useDocumentTitle("SMS Active Numbers");
  const dispatch = useDispatch<AppDispatch>();
  const { activeNumbers, loading, error } = useSelector(
    (state: RootState) => state.numbers
  );
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    // Fix: Pass the required arguments
    dispatch(fetchActiveNumbers({ page: 1, limit: 20 }));

    let interval: ReturnType<typeof setInterval> | undefined;
    if (autoRefresh) {
      interval = setInterval(() => {
        dispatch(fetchActiveNumbers({ page: 1, limit: 20 }));
      }, 10000);
    }

    return () => {
      if (interval !== undefined) {
        clearInterval(interval);
      }
    };
  }, [dispatch, autoRefresh]);

  const handleRefresh = () => {
    dispatch(fetchActiveNumbers({ page: 1, limit: 20 }));
  };

  const handleCancel = async (id: number) => {
    try {
      await dispatch(cancelNumber(id)).unwrap();
      dispatch(fetchActiveNumbers({ page: 1, limit: 20 })); // Fix: Pass arguments
    } catch (error) {
      console.error('Failed to cancel number:', error);
    }
  };

  const handleComplete = async (id: number) => {
    try {
      await dispatch(completeNumber(id)).unwrap();
      dispatch(fetchActiveNumbers({ page: 1, limit: 20 })); // Fix: Pass arguments
    } catch (error) {
      console.error('Failed to complete number:', error);
    }
  };

  const waitingNumbers = activeNumbers.filter(n => n.status === 'waiting');
  const receivedNumbers = activeNumbers.filter(n => n.status === 'received');

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="text-red-800">
          Error loading active numbers: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Header - Made responsive */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Active Numbers</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Manage your active SMS numbers and view received messages.
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Auto-refresh toggle - Made responsive */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-2.5 sm:py-2 text-sm font-medium rounded-md transition-colors ${
              autoRefresh
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </button>
          
          {/* Manual refresh - Made responsive */}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center justify-center space-x-2 px-4 py-2.5 sm:py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Stats - Made responsive */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="bg-yellow-100 p-2 sm:p-3 rounded-lg">
                <Smartphone className="h-5 w-5 sm:h-6 sm:w-6 text-yellow-600" />
              </div>
            </div>
            <div className="ml-3 sm:ml-4 min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Waiting for SMS</p>
              <p className="text-lg sm:text-2xl font-bold text-gray-900">{waitingNumbers.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="bg-green-100 p-2 sm:p-3 rounded-lg">
                <Smartphone className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />
              </div>
            </div>
            <div className="ml-3 sm:ml-4 min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">SMS Received</p>
              <p className="text-lg sm:text-2xl font-bold text-gray-900">{receivedNumbers.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="bg-blue-100 p-2 sm:p-3 rounded-lg">
                <Smartphone className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
              </div>
            </div>
            <div className="ml-3 sm:ml-4 min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Total Active</p>
              <p className="text-lg sm:text-2xl font-bold text-gray-900">{activeNumbers.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Numbers - Made responsive */}
      {activeNumbers.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 sm:p-12">
          <div className="text-center">
            <AlertCircle className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400" />
            <h3 className="mt-2 text-base sm:text-lg font-medium text-gray-900">No active numbers</h3>
            <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">
              You don't have any active SMS numbers at the moment.
            </p>
            <div className="mt-6">
              <button
                onClick={() => window.location.href = '/buy-number'}
                className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 sm:py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
              >
                Buy Your First Number
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {/* Waiting Numbers - Made responsive */}
          {waitingNumbers.length > 0 && (
            <div>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3 sm:mb-4">
                <h3 className="text-base sm:text-lg font-medium text-gray-900">
                  Waiting for SMS
                </h3>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 self-start sm:self-auto">
                  {waitingNumbers.length} active
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
                {waitingNumbers.map((number) => (
                  <NumberCard
                    key={number.id}
                    number={number}
                    onCancel={() => handleCancel(number.id)}
                    onComplete={() => handleComplete(number.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Received Numbers - Made responsive */}
          {receivedNumbers.length > 0 && (
            <div>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3 sm:mb-4">
                <h3 className="text-base sm:text-lg font-medium text-gray-900">
                  SMS Received
                </h3>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 self-start sm:self-auto">
                  {receivedNumbers.length} received
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
                {receivedNumbers.map((number) => (
                  <NumberCard
                    key={number.id}
                    number={number}
                    onCancel={() => handleCancel(number.id)}
                    onComplete={() => handleComplete(number.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ActiveNumbers;