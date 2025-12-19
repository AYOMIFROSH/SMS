// src/store/selectors/servicesSelectors.ts - FIXED: All TypeScript errors
import { RootState } from '@/store/store';

// Selector to get current selection data
// export const getCurrentSelectionData = (state: RootState) => {
//   const { services, countries, operators, selectedCountry, selectedService, selectedOperator } = state.services;
//   
//   return {
//     country: selectedCountry ? countries.find(c => c.code === selectedCountry) : null,
//     service: selectedService ? services.find(s => s.code === selectedService) : null,
//     operator: selectedCountry && selectedOperator 
//       ? operators[selectedCountry]?.find(o => o.id === selectedOperator) 
//       : null
//   };
// };

// Other useful selectors
export const getSelectedCountry = (state: RootState) => {
  const { countries, selectedCountry } = state.services;
  return selectedCountry ? countries.find(c => c.code === selectedCountry) : null;
};

export const getSelectedService = (state: RootState) => {
  const { services, selectedService } = state.services;
  return selectedService ? services.find(s => s.code === selectedService) : null;
};

// export const getSelectedOperator = (state: RootState) => {
//   const { operators, selectedCountry, selectedOperator } = state.services;
//   return selectedCountry && selectedOperator 
//     ? operators[selectedCountry]?.find(o => o.id === selectedOperator) 
//     : null;
// };

// export const getOperatorsForCountry = (state: RootState, country: string) => {
//   return state.services.operators[country] || [];
// };

export const getPriceForService = (state: RootState, country: string, service: string, operator?: string) => {
  const { prices } = state.services;
  
  if (!prices[country] || !prices[country][service]) {
    return null;
  }
  
  const servicePrices = prices[country][service];
  
  // If operator is specified, try to get operator-specific price
  if (operator && servicePrices[operator]) {
    return servicePrices[operator].cost || servicePrices[operator];
  }
  
  // Fallback to general service price
  return servicePrices.cost || servicePrices;
};