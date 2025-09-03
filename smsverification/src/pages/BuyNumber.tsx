// src/pages/BuyNumber.tsx - Mobile Responsive Version
import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
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
import { AlertCircle, CheckCircle, Info, RefreshCw, ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const BuyNumber: React.FC = () => {
    useDocumentTitle("SMS Purchase Numbers");

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
  const [showMobileSummary, setShowMobileSummary] = useState(false);

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

  // Fetch operators when country is selected
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
    dispatch(setSelectedService(null));
    dispatch(setSelectedOperator(null));
  };

  const handleServiceSelect = (serviceCode: string) => {
    dispatch(setSelectedService(serviceCode));
    dispatch(setSelectedOperator(null));
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
    }
  };

  const getCurrentPrice = () => {
    if (!prices || !selectedCountry || !selectedService) return null;
    
    const countryPrices = prices[selectedCountry];
    if (!countryPrices) return null;
    
    const servicePrices = countryPrices[selectedService];
    if (!servicePrices) return null;
    
    if (selectedOperator && servicePrices[selectedOperator]) {
      return Number(servicePrices[selectedOperator].cost || servicePrices[selectedOperator] || 0);
    }
    
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

  const getCurrentRestrictions = () => {
    if (!selectedCountry || !selectedService) return null;
    const key = `${selectedCountry}-${selectedService}`;
    return restrictions[key];
  };

  const getCurrentOperators = () => {
    if (!selectedCountry) return [];
    const countryOperators = operators[selectedCountry];
    return Array.isArray(countryOperators) ? countryOperators : [];
  };

  const goBack = () => {
    if (step === 'confirm') {
      dispatch(setSelectedOperator(null));
      setStep('operator');
    } else if (step === 'operator') {
      dispatch(setSelectedService(null));
      setStep('service');
    } else if (step === 'service') {
      dispatch(setSelectedCountry(null));
      setStep('country');
    }
  };

  // Get current step info for mobile header
  const getStepInfo = () => {
    const steps = [
      { key: 'country', title: 'Select Country', number: 1 },
      { key: 'service', title: 'Select Service', number: 2 },
      { key: 'operator', title: 'Select Operator', number: 3 },
      { key: 'confirm', title: 'Confirm Purchase', number: 4 }
    ];
    return steps.find(s => s.key === step);
  };

  const getSelectionSummary = () => {
    const countryName = countries.find(c => c.code === selectedCountry)?.name;
    const serviceName = services.find(s => s.code === selectedService)?.name;
    const operatorName = getCurrentOperators().find(o => o.id === selectedOperator)?.name;
    
    return {
      country: countryName || selectedCountry,
      service: serviceName || selectedService,
      operator: operatorName || selectedOperator,
      price: getCurrentPrice()
    };
  };

  // Loading state for initial data
  if (loading && (!services.length || !countries.length)) {
    return (
      <div className="flex items-center justify-center min-h-96 px-4">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <span className="block mt-3 text-sm text-gray-600">Loading services and countries...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error && (!services.length || !countries.length)) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
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
      </div>
    );
  }

  const stepInfo = getStepInfo();
  const summary = getSelectionSummary();

  return (
    <div className="min-h-screen bg-gray-50 lg:bg-transparent">
      {/* Mobile Header */}
      <div className="lg:hidden bg-white border-b border-gray-200 sticky  z-20">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {step !== 'country' && (
                <button
                  onClick={goBack}
                  className="p-2 -ml-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Buy SMS Number</h1>
                {stepInfo && (
                  <p className="text-xs text-gray-500">
                    Step {stepInfo.number} of 4: {stepInfo.title}
                  </p>
                )}
              </div>
            </div>
            
            <button
              onClick={refreshData}
              disabled={loading}
              className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Mobile Progress Bar */}
          <div className="mt-3">
            <div className="flex items-center space-x-2">
              {[1, 2, 3, 4].map((num) => {
                const isActive = stepInfo?.number === num;
                const isCompleted = stepInfo ? stepInfo.number > num : false;
                
                return (
                  <React.Fragment key={num}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                      isActive 
                        ? 'bg-primary-600 text-white' 
                        : isCompleted 
                        ? 'bg-green-500 text-white' 
                        : 'bg-gray-200 text-gray-500'
                    }`}>
                      {isCompleted ? '✓' : num}
                    </div>
                    {num < 4 && (
                      <div className={`flex-1 h-1 rounded ${
                        isCompleted ? 'bg-green-500' : 'bg-gray-200'
                      }`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Mobile Selection Summary - Collapsible */}
          {(selectedCountry || selectedService) && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <button
                onClick={() => setShowMobileSummary(!showMobileSummary)}
                className="flex items-center justify-between w-full text-left"
              >
                <span className="text-sm font-medium text-gray-700">Current Selection</span>
                {showMobileSummary ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </button>
              
              {showMobileSummary && (
                <div className="mt-2 space-y-1">
                  {summary.country && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Country:</span>
                      <span className="text-gray-900 font-medium">{summary.country}</span>
                    </div>
                  )}
                  {summary.service && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Service:</span>
                      <span className="text-gray-900 font-medium">{summary.service}</span>
                    </div>
                  )}
                  {summary.operator && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Operator:</span>
                      <span className="text-gray-900 font-medium">{summary.operator}</span>
                    </div>
                  )}
                  {summary.price && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Price:</span>
                      <span className="text-gray-900 font-bold">${summary.price.toFixed(4)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Desktop Header - Hidden on mobile */}
      <div className="hidden lg:block">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-600">Buy SMS Number</h1>
            <p className="text-gray-300 mt-1">Select a country, service, and operator to purchase an SMS number.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
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
              className="flex items-center justify-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Desktop Progress Steps */}
        <div className="flex items-center justify-center space-x-4 lg:space-x-8 py-4 mb-6">
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
      </div>

      {/* Content Container - Responsive */}
      <div className="lg:bg-white lg:rounded-lg lg:shadow-sm lg:border lg:border-gray-200">
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
          <div className="p-4 lg:p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4 lg:mb-6">Confirm Purchase</h3>
            
            {/* Selection Summary - Mobile Optimized */}
            <div className="bg-gray-50 rounded-lg p-4 lg:p-6 mb-4 lg:mb-6">
              <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-3 lg:gap-4">
                <div>
                  <label className="block text-xs lg:text-sm font-medium text-gray-700 mb-1">Country</label>
                  <p className="text-sm lg:text-base text-gray-900">
                    {countries.find(c => c.code === selectedCountry)?.name || selectedCountry}
                  </p>
                </div>
                <div>
                  <label className="block text-xs lg:text-sm font-medium text-gray-700 mb-1">Service</label>
                  <p className="text-sm lg:text-base text-gray-900">
                    {services.find(s => s.code === selectedService)?.name || selectedService}
                  </p>
                </div>
                {selectedOperator && (
                  <div>
                    <label className="block text-xs lg:text-sm font-medium text-gray-700 mb-1">Operator</label>
                    <p className="text-sm lg:text-base text-gray-900">
                      {getCurrentOperators().find(o => o.id === selectedOperator)?.name || selectedOperator}
                    </p>
                  </div>
                )}
              </div>
              
              {/* Max Price Setting - Mobile Optimized */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <label className="block text-xs lg:text-sm font-medium text-gray-700 mb-2">
                  Maximum Price (Optional)
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={maxPrice || ''}
                    onChange={(e) => setMaxPrice(e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="No limit"
                    className="flex-1 max-w-32 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  <span className="text-sm text-gray-500">USD</span>
                </div>
              </div>
            </div>

            {/* Price Display */}
            <PriceDisplay
              price={getCurrentPrice()}
              balance={Number(stats?.balance || 0)}
              canAfford={canAfford()}
              loading={pricesLoading}
            />

            {/* Restrictions - Mobile Optimized */}
            {getCurrentRestrictions() && (
              <div className="mt-4 lg:mt-6">
                <button
                  onClick={() => setShowRestrictions(!showRestrictions)}
                  className="flex items-center text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
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

            {/* Action Buttons - Mobile Optimized */}
            <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 mt-6">
              <button
                onClick={handlePurchase}
                disabled={purchasing || !canAfford() || pricesLoading}
                className={`flex-1 py-3 px-4 rounded-md font-medium transition-colors text-center ${
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
                onClick={goBack}
                className="lg:flex-none px-6 py-3 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-center"
                disabled={purchasing}
              >
                Back
              </button>
            </div>

            {/* Affordability Warning - Mobile Optimized */}
            {!canAfford() && getCurrentPrice() && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-800">Insufficient Balance</p>
                    <p className="text-xs lg:text-sm text-yellow-700 mt-1">
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

      {/* Mobile Bottom Navigation - Fixed position */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-30">
        <div className="flex items-center justify-between">
          {step !== 'country' && (
            <button
              onClick={goBack}
              className="flex items-center space-x-2 px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm font-medium">Back</span>
            </button>
          )}
          
          {summary.price && (
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-xs text-gray-500">Total Price</p>
                <p className="text-lg font-bold text-gray-900">${summary.price.toFixed(4)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Bottom Padding */}
      <div className="lg:hidden h-20"></div>
    </div>
  );
};

// Step Indicator Component (Desktop)
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
    <span className="text-sm font-medium hidden xl:inline">{title}</span>
  </div>
);

// Step Connector Component (Desktop)
const StepConnector: React.FC<{ isCompleted: boolean }> = ({ isCompleted }) => (
  <div className={`w-8 lg:w-16 h-1 rounded ${isCompleted ? 'bg-green-500' : 'bg-gray-200'}`}></div>
);

// Restrictions Display Component
const RestrictionsDisplay: React.FC<{ restrictions: any }> = ({ restrictions }) => {
  if (!restrictions) return null;

  return (
    <div className="space-y-3">
      {restrictions.serviceAvailable !== undefined && (
        <div className={`flex items-center ${restrictions.serviceAvailable ? 'text-green-700' : 'text-red-700'}`}>
          <CheckCircle className="h-4 w-4 mr-2 flex-shrink-0" />
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