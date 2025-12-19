// src/store/selectors/servicesSelectors.ts - FIXED: All TypeScript errors
import { RootState } from '@/store/store';


export default function OperatorSelector() {
  return null;
}

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