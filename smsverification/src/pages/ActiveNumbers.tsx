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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Active Numbers</h1>
          <p className="text-gray-600">
            Manage your active SMS numbers and view received messages.
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              autoRefresh
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </button>
          
          {/* Manual refresh */}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="bg-yellow-100 p-3 rounded-lg">
                <Smartphone className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Waiting for SMS</p>
              <p className="text-2xl font-bold text-gray-900">{waitingNumbers.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="bg-green-100 p-3 rounded-lg">
                <Smartphone className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">SMS Received</p>
              <p className="text-2xl font-bold text-gray-900">{receivedNumbers.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="bg-blue-100 p-3 rounded-lg">
                <Smartphone className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Active</p>
              <p className="text-2xl font-bold text-gray-900">{activeNumbers.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Numbers */}
      {activeNumbers.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
          <div className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-lg font-medium text-gray-900">No active numbers</h3>
            <p className="mt-1 text-sm text-gray-500">
              You don't have any active SMS numbers at the moment.
            </p>
            <div className="mt-6">
              <button
                onClick={() => window.location.href = '/buy-number'}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
              >
                Buy Your First Number
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Waiting Numbers */}
          {waitingNumbers.length > 0 && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-3">
                Waiting for SMS ({waitingNumbers.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

          {/* Received Numbers */}
          {receivedNumbers.length > 0 && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-3">
                SMS Received ({receivedNumbers.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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