// src/pages/BuyNumber.tsx - OPTIMIZED: Smart caching, minimal API calls
import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store/store';
import { useNavigate } from 'react-router-dom';
import {
  fetchPrices,
  setSelectedCountry,
  setSelectedService,
  invalidatePriceCache,
  cleanExpiredCache
} from '@/store/slices/servicesSlice';
import { purchaseNumber, clearError } from '@/store/slices/numbersSlice';
import { usePayment } from '@/hooks/usePayment';
import ServiceGrid from '@/components/services/ServiceGrid';
import CountrySelector from '@/components/services/CountrySelector';
import PriceDisplay from '@/components/services/PriceDisplay';
import toast from 'react-hot-toast';
import { AlertCircle, RefreshCw, ArrowLeft ,Clock } from 'lucide-react';
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
    priceCache
  } = useSelector((state: RootState) => state.services);

  const { purchasing } = useSelector((state: RootState) => state.numbers);
  const numbersError = useSelector((state: RootState) => state.numbers.error);

  const payment = usePayment({ autoFetch: true, enableWebSocket: true });

  const [step, setStep] = useState<'country' | 'service' | 'confirm'>('country');
  const [searchQuery, setSearchQuery] = useState('');
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [pricesFetched, setPricesFetched] = useState(false);

  // Rate limit handling
  const [rateLimitInfo, setRateLimitInfo] = useState<{
    active: boolean;
    message: string;
    countdown: number;
  } | null>(null);

  // Clean expired cache on mount
  useEffect(() => {
    dispatch(cleanExpiredCache());
  }, [dispatch]);

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

  // OPTIMIZED: Only fetch prices ONCE when user reaches confirmation
  useEffect(() => {
    if (selectedCountry && selectedService && step === 'confirm' && !pricesFetched) {
      const cacheKey = `${selectedCountry}_${selectedService}`;
      
      // Check if we have valid cache
      if (priceCache[cacheKey]) {
        const cached = priceCache[cacheKey];
        const now = Date.now();
        
        if (now < cached.expiresAt) {
          console.log('✅ Using cached prices, no API call needed');
          setPricesFetched(true);
          return;
        }
      }

      // Fetch only if cache is invalid or missing
      console.log('💲 Fetching prices for confirmation');
      
      const timer = setTimeout(() => {
        dispatch(fetchPrices({
          country: selectedCountry,
          service: selectedService,
          forceRefresh: false // Use cache if available
        }))
          .unwrap()
          .then(() => {
            setPricesFetched(true);
          })
          .catch((error: any) => {
            if (error.includes('Rate limit') || error.includes('429')) {
              setRateLimitInfo({
                active: true,
                message: "Fetching best price for you. Please wait:",
                countdown: 30
              });
            }
          });
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [selectedCountry, selectedService, step, pricesFetched, dispatch, priceCache]);

  // Reset pricesFetched when selection changes
  useEffect(() => {
    setPricesFetched(false);
  }, [selectedCountry, selectedService]);

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
    setPricesFetched(false);
    if (numbersError) {
      dispatch(clearError());
    }
  };

  const handleServiceSelect = (serviceCode: string) => {
    dispatch(setSelectedService(serviceCode));
    setPricesFetched(false);
    if (numbersError) {
      dispatch(clearError());
    }
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

    if (!canAfford()) {
      toast.error('Insufficient balance. Please top up your account.');
      return;
    }

    try {
      const purchaseData = {
        service: selectedService,
        country: selectedCountry,
        operator: undefined,
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
      setPricesFetched(false);

      navigate('/active-numbers');

    } catch (error: any) {
      console.error('❌ Purchase failed:', error);

      if (error.includes('Rate limit') || error.includes('429')) {
        setRateLimitInfo({
          active: true,
          message: "Getting best number for you. Please try again in:",
          countdown: 60
        });
        return;
      }

      if (error.includes('No numbers available')) {
        toast.error(
          'No numbers available for this service/country. Try a different combination.',
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
    setPricesFetched(false);
  };

  const refreshData = () => {
    payment.refreshBalance();
    
    // Invalidate specific cache if on confirm step
    if (selectedCountry && selectedService) {
      const cacheKey = `${selectedCountry}_${selectedService}`;
      dispatch(invalidatePriceCache(cacheKey));
      setPricesFetched(false);
      
      // Fetch fresh prices
      dispatch(fetchPrices({
        country: selectedCountry,
        service: selectedService,
        forceRefresh: true
      }))
        .unwrap()
        .then(() => {
          setPricesFetched(true);
          toast.success('Prices refreshed');
        })
        .catch((error: any) => {
          if (error.includes('Rate limit') || error.includes('429')) {
            setRateLimitInfo({
              active: true,
              message: "Getting fresh prices. Please wait:",
              countdown: 30
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
      setPricesFetched(false);
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

  const getCacheStatus = () => {
    if (!selectedCountry || !selectedService) return null;
    
    const cacheKey = `${selectedCountry}_${selectedService}`;
    const cached = priceCache[cacheKey];
    
    if (!cached) return null;
    
    const now = Date.now();
    const ageMinutes = Math.floor((now - cached.timestamp) / 1000 / 60);
    const validFor = Math.floor((cached.expiresAt - now) / 1000 / 60);
    
    return {
      age: ageMinutes,
      validFor: Math.max(0, validFor),
      isValid: now < cached.expiresAt
    };
  };

  const currentBalance = payment.balance?.balance ?? 0;
  const stepInfo = getStepInfo();
  const summary = getSelectionSummary();
  const cacheStatus = getCacheStatus();

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

          {/* Progress Bar */}
          <div className="mt-3">
            <div className="flex items-center space-x-2">
              {[1, 2, 3].map((num) => {
                const isActive = stepInfo?.number === num;
                const isCompleted = stepInfo ? stepInfo.number > num : false;

                return (
                  <React.Fragment key={num}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                      isActive ? 'bg-primary-600 text-white' :
                      isCompleted ? 'bg-green-500 text-white' :
                      'bg-gray-200 text-gray-500'
                    }`}>
                      {isCompleted ? '✓' : num}
                    </div>
                    {num < 3 && (
                      <div className={`flex-1 h-1 rounded ${isCompleted ? 'bg-green-500' : 'bg-gray-200'}`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Cache Status Indicator */}
          {cacheStatus && cacheStatus.isValid && step === 'confirm' && (
            <div className="mt-2 text-xs text-green-600 bg-green-50 px-2 py-1 rounded flex items-center justify-center">
              <span>Fresh prices ({cacheStatus.age}min old, valid for {cacheStatus.validFor}min)</span>
            </div>
          )}
        </div>
      </div>

      {/* Desktop Header */}
      <div className="hidden lg:block">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Buy SMS Number</h1>
            <p className="text-gray-400 mt-0.5">Optimized for speed - prices cached for 10 minutes</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="bg-primary-50 px-4 py-2 rounded-lg">
              <span className="text-sm text-primary-600 font-medium">
                Balance: ${currentBalance.toFixed(4)}
              </span>
            </div>

            {cacheStatus && cacheStatus.isValid && (
              <div className="text-xs text-green-600 bg-green-50 px-3 py-1 rounded-full">
                Fresh data ({cacheStatus.age}m old)
              </div>
            )}

            <div className="flex gap-3">
              {(selectedCountry || selectedService) && (
                <button
                  onClick={resetSelection}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border rounded-md hover:bg-gray-50"
                >
                  Reset
                </button>
              )}

              <button
                onClick={refreshData}
                disabled={loading || payment.loading.balance || rateLimitInfo?.active}
                className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${(loading || payment.loading.balance) ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="lg:bg-white lg:rounded-lg lg:shadow-sm lg:border">
        {step === 'country' && (
          <CountrySelector
            countries={countries}
            selectedCountry={selectedCountry}
            onSelect={handleCountrySelect}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            loading={false}
          />
        )}

        {step === 'service' && selectedCountry && (
          <ServiceGrid
            services={services}
            selectedService={selectedService}
            onSelect={handleServiceSelect}
            selectedCountry={selectedCountry}
            loading={false}
          />
        )}

        {step === 'confirm' && selectedCountry && selectedService && (
          <div className="p-4 lg:p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Confirm Purchase</h3>

            {/* Summary */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Country</label>
                  <p className="text-sm text-gray-900">{summary.country}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Service</label>
                  <p className="text-sm text-gray-900">{summary.service}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Operator</label>
                  <p className="text-sm text-green-600 font-medium">Auto-assigned</p>
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

            {/* Errors */}
            {numbersError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-800">Purchase Error</p>
                    <p className="text-sm text-red-700 mt-1">{numbersError}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={handlePurchase}
                disabled={purchasing || !canAfford() || pricesLoading || rateLimitInfo?.active}
                className={`flex-1 py-3 px-4 rounded-md font-medium transition-colors ${
                  purchasing || !canAfford() || pricesLoading || rateLimitInfo?.active
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-primary-600 text-white hover:bg-primary-700'
                }`}
              >
                {purchasing ? 'Purchasing...' : 'Purchase Number'}
              </button>

              <button
                onClick={goBack}
                disabled={purchasing || rateLimitInfo?.active}
                className="px-6 py-3 text-gray-700 bg-white border rounded-md hover:bg-gray-50"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BuyNumber;