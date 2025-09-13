// src/components/services/CountrySelector.tsx - FIXED: SMS-Activate Country Code System
import React, { useState, useEffect } from 'react';
import { Search, MapPin, Globe, Filter, X } from 'lucide-react';
import { Country } from '@/types';
import LoadingSpinner from '../common/LoadingSpinner';

interface CountrySelectorProps {
  countries: Country[];
  selectedCountry: string | null;
  onSelect: (countryCode: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  loading?: boolean;
}

// FIXED: SMS-Activate internal country codes to proper country flags mapping
const SMS_ACTIVATE_COUNTRY_FLAGS: { [key: string]: string } = {
  '36': "ca",
  '187': 'us',
  '16': 'uk',
  '19': 'ng'
  
};

// Popular SMS-Activate country codes (based on typical usage)
const popularCountryCodes = ['36', '187', '19', '16', '91', '86', '33', '49', '39', '34', '55', '81', '82'];

const CountrySelector: React.FC<CountrySelectorProps> = ({
  countries,
  selectedCountry,
  onSelect,
  searchQuery,
  onSearchChange,
  loading = false
}) => {
  const [showAllCountries, setShowAllCountries] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'popular' | 'code'>('popular');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  // Close filter menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.filter-menu')) {
        setShowFilterMenu(false);
      }
    };

    if (showFilterMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showFilterMenu]);

  // Auto-show all countries on search
  useEffect(() => {
    if (searchQuery.trim()) {
      setShowAllCountries(true);
    }
  }, [searchQuery]);

  // FIXED: Get country flag using SMS-Activate internal code
  const getCountryFlag = (smsActivateCode: string) => {
    return SMS_ACTIVATE_COUNTRY_FLAGS[smsActivateCode] || '🌍';
  };

  // FIXED: Generate country name fallback if needed
  const getDisplayName = (country: Country) => {
    if (country.name && country.name.trim()) {
      return country.name;
    }
    // Fallback to country code if name is missing
    return `Country ${country.code}`;
  };

  const filterCountries = () => {
    let filtered = countries.filter(country =>
      getDisplayName(country).toLowerCase().includes(searchQuery.toLowerCase()) ||
      country.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (country.rus && country.rus.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    // Sort countries
    switch (sortBy) {
      case 'name':
        filtered.sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
        break;
      case 'code':
        filtered.sort((a, b) => parseInt(a.code) - parseInt(b.code));
        break;
      case 'popular':
      default:
        // Keep popular countries first, then sort others by name
        const popular = filtered.filter(c => popularCountryCodes.includes(c.code));
        const others = filtered.filter(c => !popularCountryCodes.includes(c.code))
          .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
        filtered = [...popular, ...others];
        break;
    }

    return filtered;
  };

  const filteredCountries = filterCountries();
  const popularCountriesData = countries.filter(country => 
    popularCountryCodes.includes(country.code)
  );

  const displayCountries = showAllCountries || searchQuery 
    ? filteredCountries 
    : popularCountriesData;

  if (loading) {
    return (
      <div className="p-4 lg:p-6">
        <div className="flex items-center justify-center py-16 lg:py-20">
          <div className="text-center">
            <LoadingSpinner text="Loading countries.." />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6">
      {/* Mobile Header */}
      <div className="lg:hidden mb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Select Country</h3>
        <p className="text-sm text-gray-600">Choose your country to see available services</p>
      </div>

      {/* Desktop Header */}
      <div className="hidden lg:block mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Select Country</h3>
      </div>
      
      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4 lg:mb-6">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search countries..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 lg:py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 text-sm lg:text-base"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filter Button - Mobile/Tablet */}
        <div className="relative filter-menu sm:hidden">
          <button
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            className="flex items-center justify-center space-x-2 px-4 py-2.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors w-full"
          >
            <Filter className="h-4 w-4" />
            <span>Sort by {sortBy}</span>
          </button>

          {showFilterMenu && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-md shadow-lg z-10">
              {[
                { value: 'popular', label: 'Popular First' },
                { value: 'name', label: 'Name (A-Z)' },
                { value: 'code', label: 'Code (Numeric)' }
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => {
                    setSortBy(option.value as any);
                    setShowFilterMenu(false);
                  }}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                    sortBy === option.value
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sort Options - Desktop */}
        <div className="hidden sm:flex items-center space-x-2">
          <span className="text-sm text-gray-500 whitespace-nowrap">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="popular">Popular</option>
            <option value="name">Name</option>
            <option value="code">Code</option>
          </select>
        </div>
      </div>

      {/* Results Counter */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {searchQuery ? `${filteredCountries.length} results found` : 
           showAllCountries ? `${countries.length} countries` : 
           `${popularCountriesData.length} popular countries`}
        </p>

        {!searchQuery && !showAllCountries && (
          <button
            onClick={() => setShowAllCountries(true)}
            className="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
          >
            Show all countries
          </button>
        )}
      </div>

      {/* Countries Grid */}
      {displayCountries.length === 0 ? (
        <div className="text-center py-12 lg:py-16">
          <Globe className="mx-auto h-12 w-12 lg:h-16 lg:w-16 text-gray-400" />
          <h4 className="mt-4 text-base lg:text-lg font-medium text-gray-900">No countries found</h4>
          <p className="mt-2 text-sm lg:text-base text-gray-500">
            Try adjusting your search terms or clear the search.
          </p>
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="mt-4 text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Popular Countries Section - Only when not searching */}
          {!searchQuery && !showAllCountries && (
            <div className="mb-6">
              <div className="flex items-center mb-3">
                <MapPin className="h-4 w-4 text-gray-400 mr-2" />
                <span className="text-sm font-medium text-gray-700">Popular Countries</span>
              </div>
            </div>
          )}

          {/* Countries Grid - Responsive */}
          <div className={`grid gap-2 lg:gap-3 ${
            // Mobile: 1 column for better touch targets
            // Tablet: 2 columns  
            // Desktop: 3 columns
            // Large desktop: 4 columns
            'grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
          } ${
            // Max height with scroll for large lists
            displayCountries.length > 12 ? 'max-h-96 lg:max-h-[32rem] overflow-y-auto' : ''
          }`}>
            {displayCountries.map((country) => (
              <button
                key={country.code}
                onClick={() => onSelect(country.code)}
                className={`group p-3 lg:p-4 text-left border rounded-lg transition-all duration-200 hover:shadow-sm active:scale-95 ${
                  selectedCountry === country.code
                    ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500 ring-opacity-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span className="text-2xl lg:text-3xl flex-shrink-0" role="img" aria-label="Flag">
                    {getCountryFlag(country.code)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm lg:text-base font-medium text-gray-900 truncate group-hover:text-gray-800 transition-colors">
                      {getDisplayName(country)}
                    </p>
                    <div className="flex items-center space-x-2 text-xs lg:text-sm text-gray-500 group-hover:text-gray-600 transition-colors">
                      <span>Code: {country.code}</span>
                     
                    </div>
                  </div>
                  {selectedCountry === country.code && (
                    <div className="flex-shrink-0">
                      <div className="w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                      </div>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Show All Button - Mobile Optimized */}
          {!searchQuery && !showAllCountries && countries.length > popularCountriesData.length && (
            <div className="mt-6 pt-4 border-t border-gray-200 text-center">
              <button
                onClick={() => setShowAllCountries(true)}
                className="inline-flex items-center justify-center space-x-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium w-full sm:w-auto"
              >
                <Globe className="h-4 w-4" />
                <span>Show All {countries.length} Countries</span>
              </button>
            </div>
          )}

          {/* Back to Popular - When showing all */}
          {showAllCountries && !searchQuery && (
            <div className="mt-6 pt-4 border-t border-gray-200 text-center">
              <button
                onClick={() => setShowAllCountries(false)}
                className="inline-flex items-center justify-center space-x-2 px-6 py-3 bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors font-medium w-full sm:w-auto"
              >
                <MapPin className="h-4 w-4" />
                <span>Show Popular Only</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* Mobile Helper Text */}
      <div className="lg:hidden mt-6 pt-4 border-t border-gray-100">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-start space-x-2">
            <MapPin className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-blue-800 mb-1">
                Country Selection
              </p>
              <p className="text-xs text-blue-700 leading-relaxed">
                Select your country to see available SMS services and operators. Each country has a unique SMS-Activate code for API integration.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CountrySelector;