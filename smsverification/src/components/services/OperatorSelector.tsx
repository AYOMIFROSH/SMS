// src/components/services/OperatorSelector.tsx - FIXED: Remove redundant API calls
import React from 'react';
import { Operator } from '@/store/slices/servicesSlice';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { Radio, CheckCircle } from 'lucide-react';

interface OperatorSelectorProps {
  operators: Operator[] | Record<string, any>;
  selectedOperator: string | null;
  onSelect: (operatorId: string) => void;
  loading?: boolean;
  country: string;
}

// REMOVED: All the unnecessary API calls that were causing rate limits
const OperatorSelector: React.FC<OperatorSelectorProps> = ({
  operators,
  selectedOperator,
  onSelect,
  loading = false,
  country
}) => {
  if (loading) {
    return (
      <div className="p-8 text-center">
        <LoadingSpinner text="Loading available operators..." />
      </div>
    );
  }

  const safeOperators: Operator[] = Array.isArray(operators) ? operators : [];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Select Network Operator</h3>
        <p className="text-sm text-gray-600">
          Choose a specific network operator or continue without selection for automatic assignment.
        </p>
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

        {/* Show all operators from the API */}
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
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Information box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <Radio className="h-5 w-5 text-blue-400 mt-0.5 mr-3 flex-shrink-0" />
          <div>
            <h4 className="text-sm font-medium text-blue-800 mb-1">
              About Network Operators
            </h4>
            <p className="text-sm text-blue-700">
              "Any Operator" is recommended as it allows SMS-Activate to choose the best available option.
              Specific operator selection might result in "No numbers available" if that operator doesn't have numbers for this service.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OperatorSelector;