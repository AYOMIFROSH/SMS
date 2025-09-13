import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '@/store/store';
import { fetchNumberHistory } from '@/store/slices/numbersSlice';
import { format } from 'date-fns';
import { 
  Search, 
  Download, 
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Menu,
  Eye
} from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export const History: React.FC = () => {
  useDocumentTitle("SMS Verification History");
  const dispatch = useDispatch<AppDispatch>();
  const { history, loading, pagination } = useSelector((state: RootState) => state.numbers);
  
  const [filters, setFilters] = useState({
    page: 1,
    service: '',
    country: '',
    status: '',
    search: ''
  });

  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  useEffect(() => {
    dispatch(fetchNumberHistory(filters));
  }, [dispatch, filters]);

  const statusConfig = {
    waiting: { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50', text: 'Waiting' },
    received: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', text: 'Received' },
    used: { icon: CheckCircle, color: 'text-blue-600', bg: 'bg-blue-50', text: 'Completed' },
    cancelled: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', text: 'Cancelled' },
    expired: { icon: AlertCircle, color: 'text-gray-600', bg: 'bg-gray-50', text: 'Expired' },
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const exportToCSV = () => {
    const csvData = history.map(item => ({
      'Purchase Date': format(new Date(item.purchase_date), 'yyyy-MM-dd HH:mm:ss'),
      'Service': item.service_name || item.service_code,
      'Country': item.country_code,
      'Phone Number': item.phone_number,
      'Price': item.price,
      'Status': item.status,
      'SMS Code': item.sms_code || '',
      'Activation ID': item.activation_id
    }));

    const csv = [
      Object.keys(csvData[0]).join(','),
      ...csvData.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sms-history-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Header - Made responsive */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Purchase History</h1>
          <p className="text-sm sm:text-base text-gray-600">View and export your SMS purchase history.</p>
        </div>
        
        <button
          onClick={exportToCSV}
          disabled={history.length === 0}
          className="w-full sm:w-auto flex items-center justify-center space-x-2 px-4 py-2.5 sm:py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Filters - Made responsive */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
        {/* Mobile filter toggle */}
        <div className="md:hidden flex justify-between items-center mb-4">
          <h3 className="text-sm font-medium text-gray-900">Filters</h3>
          <button
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="flex items-center px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
          >
            <Menu className="w-4 h-4 mr-1" />
            {showMobileFilters ? 'Hide' : 'Show'}
          </button>
        </div>

        <div className={`${showMobileFilters ? 'block' : 'hidden'} md:block`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search numbers, services..."
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  className="pl-10 input-field"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="input-field"
              >
                <option value="">All Status</option>
                <option value="waiting">Waiting</option>
                <option value="received">Received</option>
                <option value="used">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Service
              </label>
              <input
                type="text"
                placeholder="Service code/name"
                value={filters.service}
                onChange={(e) => handleFilterChange('service', e.target.value)}
                className="input-field"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Country
              </label>
              <input
                type="text"
                placeholder="Country code"
                value={filters.country}
                onChange={(e) => handleFilterChange('country', e.target.value)}
                className="input-field"
              />
            </div>
          </div>
        </div>
      </div>

      {/* History Table - Made responsive */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-500">Loading history...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="p-8 text-center">
            <Calendar className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-lg font-medium text-gray-900">No history found</h3>
            <p className="mt-1 text-sm text-gray-500">
              No purchases match your current filters.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Cards - Show only on small screens */}
            <div className="md:hidden space-y-3 p-4">
              {history.map((item) => {
                const config = statusConfig[item.status as keyof typeof statusConfig] || statusConfig.waiting;
                const StatusIcon = config.icon;
                
                return (
                  <div key={item.id} className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 text-sm">
                          {item.service_name || item.service_code}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {item.country_code} • ${item.price?.toFixed(4)}
                        </div>
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {config.text}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                      <div>
                        <span className="text-gray-500">Phone:</span>
                        <div className="font-mono text-gray-900 truncate">
                          {item.phone_number || '-'}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500">SMS Code:</span>
                        <div className="font-mono font-bold text-green-600">
                          {item.sms_code || '-'}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                      <div className="text-xs text-gray-500">
                        {format(new Date(item.purchase_date), 'MMM dd, yyyy HH:mm')}
                      </div>
                      <button
                        onClick={() => setSelectedItem(item)}
                        className="text-xs text-blue-600 hover:text-blue-700 flex items-center"
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        Details
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table - Hide on small screens */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Service
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Phone Number
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Country
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      SMS Code
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {history.map((item) => {
                    const config = statusConfig[item.status as keyof typeof statusConfig] || statusConfig.waiting;
                    const StatusIcon = config.icon;
                    
                    return (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {item.service_name || item.service_code}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 font-mono">
                            {item.phone_number || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {item.country_code}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            ${item.price?.toFixed(4)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {config.text}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {item.sms_code ? (
                            <div className="text-sm font-mono font-bold text-green-600">
                              {item.sms_code}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {format(new Date(item.purchase_date), 'MMM dd, yyyy HH:mm')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => setSelectedItem(item)}
                            className="text-blue-600 hover:text-blue-700 font-medium"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination - Made responsive */}
            {pagination.totalPages > 1 && (
              <div className="bg-white px-4 py-3 border-t border-gray-200 sm:px-6">
                <div className="flex items-center justify-between">
                  {/* Mobile pagination */}
                  <div className="flex-1 flex justify-between sm:hidden">
                    <button
                      onClick={() => handlePageChange(Math.max(1, pagination.page - 1))}
                      disabled={pagination.page === 1}
                      className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <div className="flex items-center px-4 py-2 text-sm text-gray-700">
                      {pagination.page} of {pagination.totalPages}
                    </div>
                    <button
                      onClick={() => handlePageChange(Math.min(pagination.totalPages, pagination.page + 1))}
                      disabled={pagination.page === pagination.totalPages}
                      className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                  
                  {/* Desktop pagination */}
                  <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-gray-700">
                        Showing{' '}
                        <span className="font-medium">
                          {(pagination.page - 1) * 20 + 1}
                        </span>{' '}
                        to{' '}
                        <span className="font-medium">
                          {Math.min(pagination.page * 20, pagination.total)}
                        </span>{' '}
                        of{' '}
                        <span className="font-medium">{pagination.total}</span> results
                      </p>
                    </div>
                    <div>
                      <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                        {[...Array(pagination.totalPages)].map((_, index) => {
                          const page = index + 1;
                          return (
                            <button
                              key={page}
                              onClick={() => handlePageChange(page)}
                              className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                                page === pagination.page
                                  ? 'z-10 bg-primary-50 border-primary-500 text-primary-600'
                                  : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                              } ${
                                index === 0 ? 'rounded-l-md' : ''
                              } ${
                                index === pagination.totalPages - 1 ? 'rounded-r-md' : ''
                              }`}
                            >
                              {page}
                            </button>
                          );
                        })}
                      </nav>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Details Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold">Purchase Details</h2>
                <button onClick={() => setSelectedItem(null)}>
                  <XCircle className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                </button>
              </div>
            </div>
            
            <div className="p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>Service:</strong><br />
                  {selectedItem.service_name || selectedItem.service_code}
                </div>
                <div>
                  <strong>Country:</strong><br />
                  {selectedItem.country_code}
                </div>
                <div>
                  <strong>Phone:</strong><br />
                  <span className="font-mono">{selectedItem.phone_number || '-'}</span>
                </div>
                <div>
                  <strong>Price:</strong><br />
                  ${selectedItem.price?.toFixed(4)}
                </div>
                <div>
                  <strong>Status:</strong><br />
                  {(() => {
                    const config = statusConfig[selectedItem.status as keyof typeof statusConfig] || statusConfig.waiting;
                    const StatusIcon = config.icon;
                    return (
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {config.text}
                      </span>
                    );
                  })()}
                </div>
                <div>
                  <strong>SMS Code:</strong><br />
                  <span className="font-mono font-bold text-green-600">
                    {selectedItem.sms_code || 'Not received'}
                  </span>
                </div>
                <div className="sm:col-span-2">
                  <strong>Date:</strong><br />
                  {format(new Date(selectedItem.purchase_date), 'MMMM dd, yyyy HH:mm:ss')}
                </div>
              </div>
            </div>
            
            <div className="p-4 sm:p-6 border-t bg-gray-50">
              <button
                onClick={() => setSelectedItem(null)}
                className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};