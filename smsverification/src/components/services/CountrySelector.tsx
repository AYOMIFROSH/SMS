// src/components/services/CountrySelector.tsx
import React from 'react';
import { Search, MapPin, Loader2 } from 'lucide-react';
import { Country } from '@/types';

interface CountrySelectorProps {
  countries: Country[];
  selectedCountry: string | null;
  onSelect: (countryCode: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  loading?: boolean; // Add loading prop
}

// Popular countries that should appear first
const popularCountries = ['0', '1', '2', '3', '6', '7', '44', '33', '49'];

const CountrySelector: React.FC<CountrySelectorProps> = ({
  countries,
  selectedCountry,
  onSelect,
  searchQuery,
  onSearchChange,
  loading = false // Default to false
}) => {
  const filteredCountries = countries.filter(country =>
    country.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    country.code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const popularCountriesData = countries.filter(country => 
    popularCountries.includes(country.code)
  );

  const otherCountries = filteredCountries.filter(country => 
    !popularCountries.includes(country.code)
  );

  const getCountryFlag = (countryCode: string) => {
    // Country code to flag emoji mapping
    const flagMap: { [key: string]: string } = {
      '0': '🌍', // Global/International
      '1': '🇺🇦', // Ukraine
      '2': '🇺🇸', // USA
      '3': '🇷🇺', // Russia
      '6': '🇰🇿', // Kazakhstan
      '7': '🇷🇺', // Russia
      '44': '🇬🇧', // UK
      '33': '🇫🇷', // France
      '49': '🇩🇪', // Germany
      '34': '🇪🇸', // Spain
      '39': '🇮🇹', // Italy
      '31': '🇳🇱', // Netherlands
      '46': '🇸🇪', // Sweden
      '47': '🇳🇴', // Norway
      '48': '🇵🇱', // Poland
    };
    return flagMap[countryCode] || '🌍';
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400 mr-3" />
          <span className="text-gray-600">Loading countries...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Select Country</h3>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search countries..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>

      {/* Popular Countries */}
      {!searchQuery && popularCountriesData.length > 0 && (
        <div className="mb-8">
          <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
            <MapPin className="h-4 w-4 mr-2" />
            Popular Countries
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {popularCountriesData.map((country) => (
              <button
                key={country.code}
                onClick={() => onSelect(country.code)}
                className={`p-4 text-left border rounded-lg transition-all hover:shadow-sm ${
                  selectedCountry === country.code
                    ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">{getCountryFlag(country.code)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {country.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      +{country.code}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* All Countries */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">
          {searchQuery ? `Search Results (${filteredCountries.length})` : 'All Countries'}
        </h4>
        
        {filteredCountries.length === 0 ? (
          <div className="text-center py-8">
            <MapPin className="mx-auto h-12 w-12 text-gray-400" />
            <h4 className="mt-2 text-sm font-medium text-gray-900">No countries found</h4>
            <p className="mt-1 text-sm text-gray-500">
              Try adjusting your search terms.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
            {(searchQuery ? filteredCountries : otherCountries).map((country) => (
              <button
                key={country.code}
                onClick={() => onSelect(country.code)}
                className={`p-4 text-left border rounded-lg transition-all hover:shadow-sm ${
                  selectedCountry === country.code
                    ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">{getCountryFlag(country.code)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {country.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      +{country.code}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};


export default CountrySelector;