// src/pages/BuyNumber.tsx - OPTIMIZED: Only 2 steps, no operator API calls
import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store/store';
import { useNavigate } from 'react-router-dom';
import {
  fetchPrices,
  setSelectedCountry,
  setSelectedService,
  invalidatePriceCache
} from '@/store/slices/servicesSlice';
import { purchaseNumber, clearError } from '@/store/slices/numbersSlice';
import { usePayment } from '@/hooks/usePayment';
import ServiceGrid from '@/components/services/ServiceGrid';
import CountrySelector from '@/components/services/CountrySelector';
import PriceDisplay from '@/components/services/PriceDisplay';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import toast from 'react-hot-toast';
import { AlertCircle, CheckCircle, RefreshCw, ArrowLeft, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const BuyNumber: React.FC = () => {
  useDocumentTitle("SMS Purchase Numbers");

  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();

  const {
    services,
    countries,
    prices,
    selectedCountry,
    selectedService,
    loading,
    pricesLoading,
    lastPriceFetch
  } = useSelector((state: RootState) => state.services);

  const { purchasing } = useSelector((state: RootState) => state.numbers);
  const numbersError = useSelector((state: RootState) => state.numbers.error);

  const payment = usePayment({ autoFetch: true, enableWebSocket: true });

  // OPTIMIZED: Only 2 steps now - country -> service -> confirm
  const [step, setStep] = useState<'country' | 'service' | 'confirm'>('country');
  const [searchQuery, setSearchQuery] = useState('');
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [showMobileSummary, setShowMobileSummary] = useState(false);

  // Rate limit handling
  const [rateLimitInfo, setRateLimitInfo] = useState<{
    active: boolean;
    message: string;
    countdown: number;
  } | null>(null);

  // Error auto-clear timer
  useEffect(() => {
    if (numbersError) {
      const timer = setTimeout(() => {
        dispatch(clearError());
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [numbersError, dispatch]);

  // Rate limit countdown
  useEffect(() => {
    if (rateLimitInfo?.active && rateLimitInfo.countdown > 0) {
      const timer = setInterval(() => {
        setRateLimitInfo(prev => {
          if (!prev || prev.countdown <= 1) {
            return null;
          }
          return {
            ...prev,
            countdown: prev.countdown - 1
          };
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [rateLimitInfo]);

  // OPTIMIZED: Only fetch prices when user reaches confirmation step
  useEffect(() => {
    if (selectedCountry && selectedService && step === 'confirm') {
      // Check if we already have cached prices
      if (!prices[selectedCountry]?.[selectedService]) {
        console.log('💲 Fetching prices for purchase confirmation');

        const timer = setTimeout(() => {
          dispatch(fetchPrices({
            country: selectedCountry,
            service: selectedService,
            forceRefresh: false // Use cache if available
          }))
            .unwrap()
            .catch((error: any) => {
              if (error.includes('Rate limit') || error.includes('429')) {
                setRateLimitInfo({
                  active: true,
                  message: "Provider rate limit reached. Please wait:",
                  countdown: 30
                });
              }
            });
        }, 300);

        return () => clearTimeout(timer);
      }
    }
  }, [selectedCountry, selectedService, step, dispatch, prices]);

  // Handle step progression
  useEffect(() => {
    if (selectedCountry && selectedService) {
      setStep('confirm');
    } else if (selectedCountry && !selectedService) {
      setStep('service');
    } else if (!selectedCountry) {
      setStep('country');
    }
  }, [selectedCountry, selectedService]);

  const handleCountrySelect = (countryCode: string) => {
    dispatch(setSelectedCountry(countryCode));
    dispatch(setSelectedService(null));
    if (numbersError) {
      dispatch(clearError());
    }
  };

  const handleServiceSelect = (serviceCode: string) => {
    dispatch(setSelectedService(serviceCode));
    if (numbersError) {
      dispatch(clearError());
    }
  };

  // OPTIMIZED: Purchase with "Any Operator" (empty string)
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

    if (!canAfford()) {
      toast.error('Insufficient balance. Please top up your account.');
      return;
    }

    try {
      const purchaseData = {
        service: selectedService,
        country: selectedCountry,
        operator: undefined, // ✅ Send undefined instead of empty string
        maxPrice: maxPrice || undefined
      };

      await dispatch(purchaseNumber(purchaseData)).unwrap();

      toast.success('Number purchased successfully! Check Active Numbers page.', {
        icon: '🎉',
        duration: 4000
      });

      payment.refreshBalance();

      // Reset and navigate
      dispatch(setSelectedCountry(null));
      dispatch(setSelectedService(null));
      setStep('country');
      setMaxPrice(null);

      navigate('/active-numbers');

    } catch (error: any) {
      console.error('❌ Purchase failed:', error);

      if (error.includes('Rate limit') || error.includes('429')) {
        setRateLimitInfo({
          active: true,
          message: "Our provider is getting the best number for you. Please try again in:",
          countdown: 45
        });
        return;
      }

      if (error.includes('No numbers available')) {
        toast.error(
          'No numbers currently available for this service/country. Try a different service or country.',
          { duration: 8000, icon: '⚠️' }
        );
      } else if (error.includes('Insufficient balance')) {
        toast.error('Insufficient balance. Please top up your account.');
      } else {
        toast.error(error || 'Failed to purchase number. Please try again.');
      }

      payment.refreshBalance();
    }
  };

  const getCurrentPrice = () => {
    if (!prices || !selectedCountry || !selectedService) return null;

    const countryPrices = prices[selectedCountry];
    if (!countryPrices) return null;

    const servicePrices = countryPrices[selectedService];
    if (!servicePrices) return null;

    const realPrice = Number(servicePrices.realPrice || servicePrices.cost || 0);
    return realPrice * 2; // 100% bonus
  };

  const canAfford = () => {
    const price = getCurrentPrice();
    const currentBalance = payment.balance?.balance ?? 0;
    if (!price || !currentBalance) return false;
    return currentBalance >= price;
  };

  const resetSelection = () => {
    dispatch(setSelectedCountry(null));
    dispatch(setSelectedService(null));
    dispatch(clearError());
    setStep('country');
    setMaxPrice(null);
    setRateLimitInfo(null);
  };

  const refreshData = () => {
    payment.refreshBalance();
    dispatch(invalidatePriceCache()); // Clear price cache
    if (selectedCountry && selectedService) {
      dispatch(fetchPrices({
        country: selectedCountry,
        service: selectedService,
        forceRefresh: true // Force fresh data
      }))
        .unwrap()
        .catch((error: any) => {
          if (error.includes('Rate limit') || error.includes('429')) {
            setRateLimitInfo({
              active: true,
              message: "Provider rate limit reached. Please wait:",
              countdown: 60
            });
          }
        });
    }
    dispatch(clearError());
    setRateLimitInfo(null);
  };

  const goBack = () => {
    if (step === 'confirm') {
      dispatch(setSelectedService(null));
      setStep('service');
    } else if (step === 'service') {
      dispatch(setSelectedCountry(null));
      setStep('country');
    }
    if (numbersError) {
      dispatch(clearError());
    }
  };

  const getStepInfo = () => {
    const steps = [
      { key: 'country', title: 'Select Country', number: 1 },
      { key: 'service', title: 'Select Service', number: 2 },
      { key: 'confirm', title: 'Confirm Purchase', number: 3 }
    ];
    return steps.find(s => s.key === step);
  };

  const getSelectionSummary = () => {
    const countryName = countries.find(c => c.code === selectedCountry)?.name;
    const serviceName = services.find(s => s.code === selectedService)?.name;

    return {
      country: countryName || selectedCountry,
      service: serviceName || selectedService,
      price: getCurrentPrice()
    };
  };

  const currentBalance = payment.balance?.balance ?? 0;

  // Calculate cache age
  const getCacheAge = () => {
    if (!lastPriceFetch) return null;
    const ageMinutes = Math.floor((Date.now() - lastPriceFetch) / 1000 / 60);
    return ageMinutes;
  };

  const stepInfo = getStepInfo();
  const summary = getSelectionSummary();
  const cacheAge = getCacheAge();

  return (
    <div className="min-h-screen bg-gray-50 lg:bg-transparent">
      {/* Rate Limit Warning */}
      {rateLimitInfo?.active && (
        <div className="sticky top-0 z-50 bg-amber-500 text-white p-3 text-center">
          <div className="flex items-center justify-center space-x-2">
            <Clock className="h-4 w-4" />
            <span className="font-medium">
              {rateLimitInfo.message} {rateLimitInfo.countdown}s
            </span>
          </div>
        </div>
      )}

      {/* Mobile Header */}
      <div className="lg:hidden bg-white border-b border-gray-200 sticky top-0 z-20">
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
                    Step {stepInfo.number} of 3: {stepInfo.title}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <div className="text-xs text-gray-600 flex items-center">
                {payment.loading.balance && (
                  <div className="w-2 h-2 border border-gray-400 border-t-blue-500 rounded-full animate-spin mr-1"></div>
                )}
                ${currentBalance.toFixed(2)}
              </div>
              <button
                onClick={refreshData}
                disabled={loading || payment.loading.balance || rateLimitInfo?.active}
                className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`h-5 w-5 ${(loading || payment.loading.balance) ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Mobile Progress Bar - 3 steps now */}
          <div className="mt-3">
            <div className="flex items-center space-x-2">
              {[1, 2, 3].map((num) => {
                const isActive = stepInfo?.number === num;
                const isCompleted = stepInfo ? stepInfo.number > num : false;

                return (
                  <React.Fragment key={num}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${isActive
                      ? 'bg-primary-600 text-white'
                      : isCompleted
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-200 text-gray-500'
                      }`}>
                      {isCompleted ? '✓' : num}
                    </div>
                    {num < 3 && (
                      <div className={`flex-1 h-1 rounded ${isCompleted ? 'bg-green-500' : 'bg-gray-200'
                        }`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Mobile Selection Summary */}
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
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Operator:</span>
                    <span className="text-green-600 font-medium">Any (Auto-assigned)</span>
                  </div>
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

      {/* Desktop Header */}
      <div className="hidden lg:block">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Buy SMS Number</h1>
            <p className="text-gray-400 mt-0.5">Select country and service - operator is auto-assigned for best availability</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="bg-primary-50 px-4 py-2 rounded-lg flex items-center">
              <span className="text-sm text-primary-600 font-medium">
                Balance: ${currentBalance.toFixed(4)}
              </span>
              {payment.loading.balance && (
                <div className="ml-2 w-3 h-3 border border-primary-400 border-t-primary-600 rounded-full animate-spin"></div>
              )}
            </div>

            {cacheAge !== null && cacheAge < 30 && (
              <div className="text-xs text-green-600 bg-green-50 px-3 py-1 rounded-full">
                Fresh data ({cacheAge}m old)
              </div>
            )}

            <div className="flex gap-3">
              {(selectedCountry || selectedService) && (
                <button
                  onClick={resetSelection}
                  className="px-2 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Reset
                </button>
              )}

              <button
                onClick={refreshData}
                disabled={loading || payment.loading.balance || rateLimitInfo?.active}
                className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${(loading || payment.loading.balance) ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>

        {/* Desktop Progress Steps - 3 steps */}
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
            title="Confirm Purchase"
            isActive={step === 'confirm'}
            isCompleted={false}
          />
        </div>


      </div>

      {/* Content Container */}
      <div className="lg:bg-white lg:rounded-lg lg:shadow-sm lg:border lg:border-gray-200">
        {step === 'country' && (
          <CountrySelector
            countries={countries}
            selectedCountry={selectedCountry}
            onSelect={handleCountrySelect}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            loading={false} // No loading - using static data
          />
        )}

        {step === 'service' && selectedCountry && (
          <ServiceGrid
            services={services}
            selectedService={selectedService}
            onSelect={handleServiceSelect}
            selectedCountry={selectedCountry}
            loading={false} // No loading - using static data
          />
        )}

        {step === 'confirm' && selectedCountry && selectedService && (
          <div className="p-4 lg:p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4 lg:mb-6">Confirm Purchase</h3>

            {/* Selection Summary */}
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
                <div>
                  <label className="block text-xs lg:text-sm font-medium text-gray-700 mb-1">Operator</label>
                  <p className="text-sm lg:text-base text-green-600 font-medium">
                    Any Operator (Auto-assigned)
                  </p>
                </div>
              </div>

              {/* Max Price Setting */}
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
                    className="flex-1 max-w-32 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-500">USD</span>
                </div>
              </div>
            </div>

            {/* Price Display */}
            <PriceDisplay
              price={getCurrentPrice()}
              balance={currentBalance}
              canAfford={canAfford()}
              loading={pricesLoading || rateLimitInfo?.active}
              balanceLoading={payment.loading.balance}
            />

            {/* Error Display */}
            {numbersError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-800">Purchase Error</p>
                    <p className="text-sm text-red-700 mt-1">{numbersError}</p>
                    <button
                      onClick={() => dispatch(clearError())}
                      className="mt-2 text-sm font-medium text-red-600 hover:text-red-700"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 mt-6">
              <button
                onClick={handlePurchase}
                disabled={purchasing || !canAfford() || pricesLoading || payment.loading.balance || rateLimitInfo?.active}
                className={`flex-1 py-3 px-4 rounded-md font-medium transition-colors text-center ${purchasing || !canAfford() || pricesLoading || payment.loading.balance || rateLimitInfo?.active
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-primary-600 text-white hover:bg-primary-700'
                  }`}
              >
                {rateLimitInfo?.active ? (
                  <span className="flex items-center justify-center">
                    <Clock className="h-4 w-4 mr-2" />
                    <span>Wait {rateLimitInfo.countdown}s</span>
                  </span>
                ) : purchasing ? (
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
                disabled={purchasing || rateLimitInfo?.active}
              >
                Back
              </button>
            </div>

            {/* Affordability Warning */}
            {!canAfford() && getCurrentPrice() && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-800">Insufficient Balance</p>
                    <p className="text-xs lg:text-sm text-yellow-700 mt-1">
                      You need ${getCurrentPrice()?.toFixed(4)} but only have ${currentBalance.toFixed(4)}.
                      Please <a href="/transactions" className="underline hover:no-underline">top up your account</a>.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile Bottom Padding */}
      <div className="lg:hidden h-20"></div>
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
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${isActive
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

// Step Connector
const StepConnector: React.FC<{ isCompleted: boolean }> = ({ isCompleted }) => (
  <div className={`w-8 lg:w-16 h-1 rounded ${isCompleted ? 'bg-green-500' : 'bg-gray-200'}`}></div>
);

export default BuyNumber;