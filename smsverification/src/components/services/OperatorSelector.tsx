// src/components/services/OperatorSelector.tsx - FIXED: All TypeScript errors
import React from 'react';
import { Operator } from '@/store/slices/servicesSlice';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { Radio, AlertCircle, CheckCircle } from 'lucide-react';
// ADD this import at the top of OperatorSelector.tsx:
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import { servicesApi } from '@/api/services';
import { useState, useEffect } from 'react';

interface OperatorSelectorProps {
  operators: Operator[] | Record<string, any>;
  selectedOperator: string | null;
  onSelect: (operatorId: string) => void;
  loading?: boolean;
  country: string;
}

// REPLACE the entire OperatorSelector component with this:
// REPLACE the entire filtering logic in OperatorSelector.tsx with this:

const OperatorSelector: React.FC<OperatorSelectorProps> = ({
  operators,
  selectedOperator,
  onSelect,
  loading = false,
  country
}) => {
  const [availability, setAvailability] = useState<any>({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  
  const selectedService = useSelector((state: RootState) => state.services.selectedService);

  // Fetch availability when service and operators are available
  useEffect(() => {
    if (selectedService && country && operators && Array.isArray(operators) && operators.length > 0) {
      setAvailabilityLoading(true);
      servicesApi.getAvailability({ country })
        .then(response => {
          if (response.success) {
            setAvailability(response.data);
          }
        })
        .catch(error => {
          console.error('Failed to fetch availability:', error);
        })
        .finally(() => {
          setAvailabilityLoading(false);
        });
    }
  }, [selectedService, country, operators]);

  if (loading || availabilityLoading) {
    return (
      <div className="p-8 text-center">
        <LoadingSpinner text="Loading available operators..." />
      </div>
    );
  }

  const safeOperators: Operator[] = Array.isArray(operators) ? operators : [];

  // Check if the service has availability (regardless of operator)
 // FIXED version - handle null selectedService:
const serviceHasAvailability = selectedService && availability[selectedService] && parseInt(availability[selectedService]) > 0;

console.log('Availability check:', {
  selectedService,
  serviceHasAvailability,
  availabilityCount: selectedService ? availability[selectedService] : null,
  totalOperators: safeOperators.length
});

  return (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Select Network Operator</h3>
        <p className="text-sm text-gray-600">
          Choose a specific network operator or continue without selection for automatic assignment.
        </p>
        <div className={`mt-2 rounded-lg p-3 ${
          serviceHasAvailability 
            ? 'bg-green-50 border border-green-200' 
            : 'bg-yellow-50 border border-yellow-200'
        }`}>
          <div className="flex items-center">
            <Radio className={`h-4 w-4 mr-2 ${
              serviceHasAvailability ? 'text-green-600' : 'text-yellow-600'
            }`} />
            <span className={`text-sm ${
              serviceHasAvailability ? 'text-green-800' : 'text-yellow-800'
            }`}>
              {serviceHasAvailability 
                ? `${availability[selectedService]} numbers available for ${selectedService?.toUpperCase()}`
                : `Limited availability for ${selectedService?.toUpperCase()}`
              }
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        {/* Any Operator option - Always show this */}
        <div
          onClick={() => onSelect('')}
          className={`relative rounded-lg border p-4 cursor-pointer transition-all ${
            selectedOperator === '' || selectedOperator === null
              ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500'
              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                selectedOperator === '' || selectedOperator === null
                  ? 'border-primary-500 bg-primary-500'
                  : 'border-gray-300'
              }`}>
                {(selectedOperator === '' || selectedOperator === null) && (
                  <div className="w-2 h-2 rounded-full bg-white" />
                )}
              </div>
            </div>
            <div className="ml-3 flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-gray-900">
                    Any Operator (Recommended)
                  </h4>
                  <p className="text-sm text-gray-500">
                    System will automatically assign the best available operator
                  </p>
                </div>
                <div className="flex items-center text-green-600">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  <span className="text-xs font-medium">Best Choice</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Show all operators but with availability status */}
        {safeOperators.map((operator, idx) => {
          const operatorId = operator.id || `op-${idx}`;
          const operatorName = operator.name || operatorId;

          return (
            <div
              key={operatorId}
              onClick={() => onSelect(String(operatorId))}
              className={`relative rounded-lg border p-4 cursor-pointer transition-all ${
                selectedOperator === String(operatorId)
                  ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    selectedOperator === String(operatorId)
                      ? 'border-primary-500 bg-primary-500'
                      : 'border-gray-300'
                  }`}>
                    {selectedOperator === String(operatorId) && (
                      <div className="w-2 h-2 rounded-full bg-white" />
                    )}
                  </div>
                </div>
                <div className="ml-3 flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">
                        {operatorName}
                      </h4>
                      <p className="text-sm text-gray-500">
                        Network operator in {country}
                      </p>
                    </div>
                    <div className="flex items-center text-yellow-600">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      <span className="text-xs font-medium">May Not Have Numbers</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Warning message */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-blue-400 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-blue-800 mb-1">
                Operator Availability Notice
              </h4>
              <p className="text-sm text-blue-700">
                Specific operators may not have numbers available for {selectedService?.toUpperCase()}. 
                If you get a "No numbers available" error, please use "Any Operator" option which automatically selects the best available operator.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <Radio className="h-5 w-5 text-blue-400 mt-0.5 mr-3 flex-shrink-0" />
          <div>
            <h4 className="text-sm font-medium text-blue-800 mb-1">
              About Network Operators
            </h4>
            <p className="text-sm text-blue-700">
              "Any Operator" is recommended as it allows the system to choose the best available option.
              Specific operator selection might result in "No numbers available" if that operator doesn't have numbers for this service.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OperatorSelector;
