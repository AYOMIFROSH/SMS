// src/pages/BuyNumber.tsx - FIXED: Handle exact server data
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '@/store/store';
import { 
  fetchServices, 
  fetchCountries, 
  fetchOperators,
  fetchPrices,
  fetchRestrictions,
  setSelectedCountry,
  setSelectedService,
  setSelectedOperator
} from '@/store/slices/servicesSlice';
import { purchaseNumber } from '@/store/slices/numbersSlice';
import ServiceGrid from '@/components/services/ServiceGrid';
import CountrySelector from '@/components/services/CountrySelector';
import OperatorSelector from '@/components/services/OperatorSelector';
import PriceDisplay from '@/components/services/PriceDisplay';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import toast from 'react-hot-toast';
import { AlertCircle, CheckCircle, Info, RefreshCw } from 'lucide-react';

const BuyNumber: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { 
    services, 
    countries, 
    operators,
    prices, 
    restrictions,
    selectedCountry, 
    selectedService,
    selectedOperator,
    loading,
    operatorsLoading,
    pricesLoading,
    error
  } = useSelector((state: RootState) => state.services);
  
  const { purchasing } = useSelector((state: RootState) => state.numbers);
  const { stats } = useSelector((state: RootState) => state.dashboard);

  const [step, setStep] = useState<'country' | 'service' | 'operator' | 'confirm'>('country');
  const [searchQuery, setSearchQuery] = useState('');
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [showRestrictions, setShowRestrictions] = useState(false);

  // Initialize data
  useEffect(() => {
    console.log('🚀 BuyNumber: Initializing data fetch');
    dispatch(fetchServices());
    dispatch(fetchCountries());
  }, [dispatch]);

  // Handle step progression
  useEffect(() => {
    if (selectedCountry && selectedService && selectedOperator !== null) {
      setStep('confirm');
    } else if (selectedCountry && selectedService) {
      setStep('operator');
    } else if (selectedCountry && !selectedService) {
      setStep('service');
    } else if (!selectedCountry) {
      setStep('country');
    }
  }, [selectedCountry, selectedService, selectedOperator]);

  // FIXED: Fetch operators when country is selected
  useEffect(() => {
    if (selectedCountry) {
      console.log('🌍 Fetching operators for country:', selectedCountry);
      dispatch(fetchOperators(selectedCountry));
    }
  }, [selectedCountry, dispatch]);

  // Fetch prices when service and country are selected
  useEffect(() => {
    if (selectedCountry && selectedService) {
      console.log('💲 Fetching prices for:', { country: selectedCountry, service: selectedService });
      dispatch(fetchPrices({ country: selectedCountry, service: selectedService }));
      
      // Fetch restrictions
      dispatch(fetchRestrictions({ country: selectedCountry, service: selectedService }));
    }
  }, [selectedCountry, selectedService, dispatch]);

  const handleCountrySelect = (countryCode: string) => {
    dispatch(setSelectedCountry(countryCode));
    dispatch(setSelectedService(null)); // Reset service selection
    dispatch(setSelectedOperator(null)); // Reset operator selection
  };

  const handleServiceSelect = (serviceCode: string) => {
    dispatch(setSelectedService(serviceCode));
    dispatch(setSelectedOperator(null)); // Reset operator selection
  };

  const handleOperatorSelect = (operatorId: string) => {
    dispatch(setSelectedOperator(operatorId));
  };

  const handlePurchase = async () => {
    if (!selectedService || !selectedCountry) {
      toast.error('Please select a service and country');
      return;
    }

    const currentPrice = getCurrentPrice();
    if (maxPrice && currentPrice && currentPrice > maxPrice) {
      toast.error(`Price ${currentPrice.toFixed(4)} exceeds your maximum of ${maxPrice.toFixed(4)}`);
      return;
    }

    try {
      const purchaseData = {
        service: selectedService,
        country: selectedCountry,
        operator: selectedOperator || undefined,
        maxPrice: maxPrice || undefined
      };

      console.log('🛒 Purchasing number with data:', purchaseData);
      
      await dispatch(purchaseNumber(purchaseData)).unwrap();
      
      toast.success('Number purchased successfully!', {
        icon: '🎉',
        duration: 5000
      });
      
      // Reset selections
      dispatch(setSelectedCountry(null));
      dispatch(setSelectedService(null));
      dispatch(setSelectedOperator(null));
      setStep('country');
      setMaxPrice(null);
      
    } catch (error: any) {
      console.error('❌ Purchase failed:', error);
      // Error handling is done in the API client
    }
  };

  const getCurrentPrice = () => {
    if (!prices || !selectedCountry || !selectedService) return null;
    
    // FIXED: Handle different price structure possibilities
    const countryPrices = prices[selectedCountry];
    if (!countryPrices) return null;
    
    const servicePrices = countryPrices[selectedService];
    if (!servicePrices) return null;
    
    // If operator is selected, try to get operator-specific price
    if (selectedOperator && servicePrices[selectedOperator]) {
      return Number(servicePrices[selectedOperator].cost || servicePrices[selectedOperator] || 0);
    }
    
    // Fallback to general service price
    return Number(servicePrices.cost || servicePrices || 0);
  };

  const canAfford = () => {
    const price = getCurrentPrice();
    if (!price || !stats?.balance) return false;
    return Number(stats.balance) >= price;
  };

  const resetSelection = () => {
    dispatch(setSelectedCountry(null));
    dispatch(setSelectedService(null));
    dispatch(setSelectedOperator(null));
    setStep('country');
    setMaxPrice(null);
    setShowRestrictions(false);
  };

  const refreshData = () => {
    dispatch(fetchServices());
    dispatch(fetchCountries());
    if (selectedCountry) {
      dispatch(fetchOperators(selectedCountry));
    }
    if (selectedCountry && selectedService) {
      dispatch(fetchPrices({ country: selectedCountry, service: selectedService }));
    }
  };

  // Get current restrictions
  const getCurrentRestrictions = () => {
    if (!selectedCountry || !selectedService) return null;
    const key = `${selectedCountry}-${selectedService}`;
    return restrictions[key];
  };

  // FIXED: Get operators for current country safely
  const getCurrentOperators = () => {
    if (!selectedCountry) return [];
    const countryOperators = operators[selectedCountry];
    return Array.isArray(countryOperators) ? countryOperators : [];
  };

  // Loading state for initial data
  if (loading && (!services.length || !countries.length)) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
        <span className="ml-3 text-gray-600">Loading services and countries...</span>
      </div>
    );
  }

  // Error state
  if (error && (!services.length || !countries.length)) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center">
          <AlertCircle className="h-5 w-5 text-red-400 mr-3" />
          <div>
            <h3 className="text-sm font-medium text-red-800">Error Loading Data</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
            <button
              onClick={refreshData}
              className="mt-3 text-sm font-medium text-red-800 hover:text-red-900 underline"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Buy SMS Number</h1>
          <p className="text-gray-600">Select a country, service, and operator to purchase an SMS number.</p>
        </div>
        
        <div className="flex space-x-3">
          {(selectedCountry || selectedService || selectedOperator) && (
            <button
              onClick={resetSelection}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Reset Selection
            </button>
          )}
          
          <button
            onClick={refreshData}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center space-x-8 py-4">
        <StepIndicator 
          step={1} 
          title="Select Country" 
          isActive={step === 'country'} 
          isCompleted={Boolean(selectedCountry)} 
        />
        <StepConnector isCompleted={Boolean(selectedCountry)} />
        <StepIndicator 
          step={2} 
          title="Select Service" 
          isActive={step === 'service'} 
          isCompleted={Boolean(selectedService)} 
        />
        <StepConnector isCompleted={Boolean(selectedService)} />
        <StepIndicator 
          step={3} 
          title="Select Operator" 
          isActive={step === 'operator'} 
          isCompleted={Boolean(selectedOperator !== null)} 
        />
        <StepConnector isCompleted={Boolean(selectedOperator !== null)} />
        <StepIndicator 
          step={4} 
          title="Confirm Purchase" 
          isActive={step === 'confirm'} 
          isCompleted={false} 
        />
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {step === 'country' && (
          <CountrySelector
            countries={countries}
            selectedCountry={selectedCountry}
            onSelect={handleCountrySelect}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            loading={loading}
          />
        )}

        {step === 'service' && selectedCountry && (
          <ServiceGrid
            services={services}
            selectedService={selectedService}
            onSelect={handleServiceSelect}
            selectedCountry={selectedCountry}
            loading={loading}
          />
        )}

        {step === 'operator' && selectedCountry && selectedService && (
          <OperatorSelector
            operators={getCurrentOperators()}
            selectedOperator={selectedOperator}
            onSelect={handleOperatorSelect}
            loading={operatorsLoading}
            country={selectedCountry}
          />
        )}

        {step === 'confirm' && selectedCountry && selectedService && (
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-6">Confirm Purchase</h3>
            
            {/* Selection Summary */}
            <div className="bg-gray-50 rounded-lg p-6 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Country</label>
                  <p className="text-base text-gray-900 mt-1">
                    {countries.find(c => c.code === selectedCountry)?.name || selectedCountry}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Service</label>
                  <p className="text-base text-gray-900 mt-1">
                    {services.find(s => s.code === selectedService)?.name || selectedService}
                  </p>
                </div>
                {selectedOperator && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Operator</label>
                    <p className="text-base text-gray-900 mt-1">
                      {getCurrentOperators().find(o => o.id === selectedOperator)?.name || selectedOperator}
                    </p>
                  </div>
                )}
              </div>
              
              {/* Max Price Setting */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Maximum Price (Optional)
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={maxPrice || ''}
                  onChange={(e) => setMaxPrice(e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="No limit"
                  className="w-32 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <span className="ml-2 text-sm text-gray-500">USD</span>
              </div>
            </div>

            {/* Price Display */}
            <PriceDisplay
              price={getCurrentPrice()}
              balance={Number(stats?.balance || 0)}
              canAfford={canAfford()}
              loading={pricesLoading}
            />

            {/* Restrictions */}
            {getCurrentRestrictions() && (
              <div className="mt-6">
                <button
                  onClick={() => setShowRestrictions(!showRestrictions)}
                  className="flex items-center text-sm font-medium text-primary-600 hover:text-primary-700"
                >
                  <Info className="h-4 w-4 mr-1" />
                  {showRestrictions ? 'Hide' : 'Show'} Service Information
                </button>
                
                {showRestrictions && (
                  <div className="mt-3 p-4 bg-blue-50 rounded-lg">
                    <RestrictionsDisplay restrictions={getCurrentRestrictions()} />
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-4 mt-6">
              <button
                onClick={handlePurchase}
                disabled={purchasing || !canAfford() || pricesLoading}
                className={`flex-1 py-3 px-4 rounded-md font-medium transition-colors ${
                  purchasing || !canAfford() || pricesLoading
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-primary-600 text-white hover:bg-primary-700'
                }`}
              >
                {purchasing ? (
                  <span className="flex items-center justify-center">
                    <LoadingSpinner size="sm" color="white" />
                    <span className="ml-2">Purchasing...</span>
                  </span>
                ) : pricesLoading ? (
                  <span className="flex items-center justify-center">
                    <LoadingSpinner size="sm" color="white" />
                    <span className="ml-2">Loading Price...</span>
                  </span>
                ) : (
                  'Purchase Number'
                )}
              </button>
              
              <button
                onClick={() => {
                  dispatch(setSelectedOperator(null));
                  setStep('operator');
                }}
                className="px-6 py-3 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                disabled={purchasing}
              >
                Back
              </button>
            </div>

            {/* Affordability Warning */}
            {!canAfford() && getCurrentPrice() && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center">
                  <AlertCircle className="h-5 w-5 text-yellow-400 mr-3" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800">Insufficient Balance</p>
                    <p className="text-sm text-yellow-700 mt-1">
                      You need ${getCurrentPrice()?.toFixed(4)} but only have ${Number(stats?.balance || 0).toFixed(4)}.
                      Please top up your account to continue.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Step Indicator Component
const StepIndicator: React.FC<{
  step: number;
  title: string;
  isActive: boolean;
  isCompleted: boolean;
}> = ({ step, title, isActive, isCompleted }) => (
  <div className={`flex items-center space-x-2 ${isActive ? 'text-primary-600' : isCompleted ? 'text-green-600' : 'text-gray-400'}`}>
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
      isActive 
        ? 'bg-primary-600 text-white' 
        : isCompleted 
        ? 'bg-green-500 text-white' 
        : 'bg-gray-200 text-gray-500'
    }`}>
      {isCompleted ? <CheckCircle className="w-4 h-4" /> : step}
    </div>
    <span className="text-sm font-medium">{title}</span>
  </div>
);

// Step Connector Component
const StepConnector: React.FC<{ isCompleted: boolean }> = ({ isCompleted }) => (
  <div className={`w-16 h-1 rounded ${isCompleted ? 'bg-green-500' : 'bg-gray-200'}`}></div>
);

// Restrictions Display Component
const RestrictionsDisplay: React.FC<{ restrictions: any }> = ({ restrictions }) => {
  if (!restrictions) return null;

  return (
    <div className="space-y-3">
      {restrictions.serviceAvailable !== undefined && (
        <div className={`flex items-center ${restrictions.serviceAvailable ? 'text-green-700' : 'text-red-700'}`}>
          <CheckCircle className="h-4 w-4 mr-2" />
          <span className="text-sm">
            Service {restrictions.serviceAvailable ? 'available' : 'not available'}
          </span>
        </div>
      )}
      
      {restrictions.availableOperators && (
        <div className="text-sm text-gray-700">
          <strong>Available operators:</strong> {restrictions.availableOperators}
        </div>
      )}
      
      {restrictions.currentStock && (
        <div className="text-sm text-gray-700">
          <strong>Current stock:</strong> {restrictions.currentStock} numbers
        </div>
      )}
      
      {restrictions.priceRange && (
        <div className="text-sm text-gray-700">
          <strong>Price range:</strong> ${restrictions.priceRange.min} - ${restrictions.priceRange.max} 
          (avg: ${restrictions.priceRange.average})
        </div>
      )}
      
      {restrictions.recommendations && restrictions.recommendations.length > 0 && (
        <div className="space-y-2">
          <strong className="text-sm text-gray-700">Recommendations:</strong>
          {restrictions.recommendations.map((rec: any, index: number) => (
            <div key={index} className="text-sm text-gray-600 ml-2">
              • {rec.message} {rec.action && `- ${rec.action}`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BuyNumber;