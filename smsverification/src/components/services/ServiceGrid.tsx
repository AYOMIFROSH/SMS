// src/components/services/ServiceGrid.tsx - FIXED: Handle exact server data and TypeScript errors
import React, { useState } from 'react';
import { Search, Star, Smartphone } from 'lucide-react';
import { Service } from '@/types';
import LoadingSpinner from '@/components/common/LoadingSpinner'

interface ServiceGridProps {
  services: Service[];
  selectedService: string | null;
  onSelect: (serviceCode: string) => void;
  selectedCountry: string;
  loading?: boolean;
}

const ServiceGrid: React.FC<ServiceGridProps> = ({
  services = [], // Default to empty array as safety
  selectedService,
  onSelect,
  selectedCountry,
  loading = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>('all');

  console.log('🔧 ServiceGrid received:', { 
    services, 
    servicesType: typeof services, 
    servicesLength: Array.isArray(services) ? services.length : 'not array',
    selectedCountry 
  });

  // FIXED: Ensure services is always an array and handle server data format without duplicate properties
  const safeServices = Array.isArray(services) ? services.map(service => {
    // Handle different service data formats from server
    if (typeof service === 'object' && service !== null) {
      // FIXED: Avoid duplicate property assignments by extracting only needed properties
      const baseService = {
        code: service.code || service.id || '',
        name: service.name || service.title || service.code || service.id || '',
        category: service.category || 'other',
        popular: service.popular || false,
        isFavorite: service.isFavorite || false,
      };
      
      // Add optional properties only if they exist
      if (service.price !== undefined) {
        (baseService as any).price = Number(service.price);
      }
      
      if (service.available !== undefined) {
        (baseService as any).available = Number(service.available);
      }
      
      return baseService as Service;
    }
    return service;
  }).filter(service => service && service.code) : []; // Filter out invalid services

  if (loading) {
    return (
      <div className="p-8 text-center">
        <LoadingSpinner text="Loading services..." />
      </div>
    );
  }

  // Get service icon/emoji based on service name or code
  const getServiceIcon = (service: Service) => {
    const name = (service.name?.toLowerCase() || service.code?.toLowerCase() || '');
    
    const iconMap: { [key: string]: string } = {
      'whatsapp': '💬',
      'wa': '💬',
      'telegram': '📱',
      'tg': '📱',
      'discord': '🎮',
      'instagram': '📸',
      'ig': '📸',
      'facebook': '👥',
      'fb': '👥',
      'twitter': '🐦',
      'tw': '🐦',
      'tiktok': '🎵',
      'youtube': '📺',
      'netflix': '🎬',
      'spotify': '🎧',
      'uber': '🚗',
      'amazon': '📦',
      'google': '🔍',
      'go': '🔍',
      'microsoft': '💻',
      'apple': '🍎',
      'linkedin': '💼',
      'li': '💼',
      'snapchat': '👻',
      'pinterest': '📌',
      'reddit': '🔗',
      'twitch': '🎮',
      'signal': '🔐',
      'viber': '📞',
      'vi': '📞',
      'wechat': '💭',
      'line': '📱',
      'skype': '📞',
      'zoom': '📹',
    };

    // Check if service name/code contains any of our mapped services
    for (const [key, icon] of Object.entries(iconMap)) {
      if (name.includes(key)) {
        return icon;
      }
    }

    return '📱'; // Default icon
  };

  // Get categories from services
  const categories = ['all', ...new Set(safeServices.map(s => s.category).filter(Boolean))];

  // Filter services
  const filteredServices = safeServices.filter(service => {
    if (!service || !service.code) return false;
    
    const matchesSearch = !searchQuery || 
      service.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      service.code?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === 'all' || 
      service.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  // Popular services that should appear first
  const popularServices = ['whatsapp', 'wa', 'telegram', 'tg', 'discord', 'instagram', 'ig', 'facebook', 'fb'];
  
  const popularServicesData = filteredServices.filter(service =>
    service.popular || popularServices.some(popular => 
      service.name?.toLowerCase().includes(popular) ||
      service.code?.toLowerCase().includes(popular)
    )
  );

  const otherServices = filteredServices.filter(service =>
    !service.popular && !popularServices.some(popular => 
      service.name?.toLowerCase().includes(popular) ||
      service.code?.toLowerCase().includes(popular)
    )
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Select Service</h3>
        
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search services..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        {/* Category Filter */}
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  selectedCategory === category
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {category === 'all' ? 'All' : category}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Show message if no services available */}
      {safeServices.length === 0 && (
        <div className="text-center py-8">
          <Smartphone className="mx-auto h-12 w-12 text-gray-400" />
          <h4 className="mt-2 text-sm font-medium text-gray-900">No services available</h4>
          <p className="mt-1 text-sm text-gray-500">
            Services are loading or not available for this country.
          </p>
        </div>
      )}

      {/* Popular Services */}
      {!searchQuery && popularServicesData.length > 0 && (
        <div className="mb-8">
          <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
            <Star className="h-4 w-4 mr-2" />
            Popular Services
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {popularServicesData.map((service) => (
              <button
                key={service.code}
                onClick={() => onSelect(service.code)}
                className={`p-4 text-center border rounded-lg transition-all hover:shadow-sm ${
                  selectedService === service.code
                    ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-3xl mb-2">{getServiceIcon(service)}</div>
                <p className="text-sm font-medium text-gray-900 truncate">
                  {service.name || service.code}
                </p>
                {(service as any).price && (
                  <p className="text-xs text-gray-500 mt-1">
                    ${(service as any).price.toFixed(4)}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* All Services */}
      {safeServices.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">
            {searchQuery ? `Search Results (${filteredServices.length})` : 'All Services'}
          </h4>
          
          {filteredServices.length === 0 ? (
            <div className="text-center py-8">
              <Smartphone className="mx-auto h-12 w-12 text-gray-400" />
              <h4 className="mt-2 text-sm font-medium text-gray-900">No services found</h4>
              <p className="mt-1 text-sm text-gray-500">
                Try adjusting your search terms or category filter.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 max-h-96 overflow-y-auto">
              {(searchQuery ? filteredServices : otherServices).map((service) => (
                <button
                  key={service.code}
                  onClick={() => onSelect(service.code)}
                  className={`p-4 text-center border rounded-lg transition-all hover:shadow-sm ${
                    selectedService === service.code
                      ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-3xl mb-2">{getServiceIcon(service)}</div>
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {service.name || service.code}
                  </p>
                  {(service as any).price && (
                    <p className="text-xs text-gray-500 mt-1">
                      ${(service as any).price.toFixed(4)}
                    </p>
                  )}
                  {(service as any).available !== undefined && (
                    <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs mt-2 ${
                      (service as any).available > 0
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {(service as any).available > 0 ? `${(service as any).available} available` : 'Unavailable'}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ServiceGrid;