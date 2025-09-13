// src/components/services/OperatorSelector.tsx - FIXED: All TypeScript errors
import React from 'react';
import { Operator } from '@/store/slices/servicesSlice';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { Radio, AlertCircle, CheckCircle } from 'lucide-react';

interface OperatorSelectorProps {
  operators: Operator[] | Record<string, any>;
  selectedOperator: string | null;
  onSelect: (operatorId: string) => void;
  loading?: boolean;
  country: string;
}

const OperatorSelector: React.FC<OperatorSelectorProps> = ({
  operators,
  selectedOperator,
  onSelect,
  loading = false,
  country
}) => {
  console.log('🔧 OperatorSelector received:', { 
    operators, 
    operatorsType: typeof operators, 
    operatorsLength: Array.isArray(operators) ? operators.length : 'not array',
    country 
  });

  if (loading) {
    return (
      <div className="p-8 text-center">
        <LoadingSpinner text='Loading operators...' />
      </div>
    );
  }

  // NORMALIZE: Ensure operators is always an array
  // Handles:
  // - Operator[]
  // - { "0": {...}, "187": {...} } numeric-keyed objects
  // - plain object maps { id: {...}, ... }
  const safeOperators: Operator[] = Array.isArray(operators)
    ? operators
    : (operators && typeof operators === 'object')
      ? (Object.values(operators)
          // flatten if some entries are arrays
          .flat()
          // remove falsy entries
          .filter(Boolean) as Operator[])
      : [];

  if (safeOperators.length === 0) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Operators Available</h3>
        <p className="text-sm text-gray-500 mb-4">
          No operators are currently available for this country.
        </p>
        <button
          onClick={() => onSelect('')}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
        >
          Continue Without Operator
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Select Network Operator</h3>
        <p className="text-sm text-gray-600">
          Choose a specific network operator or continue without selection for automatic assignment.
        </p>
      </div>

      <div className="space-y-3 mb-6">
        {/* Option to skip operator selection */}
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
                    Any Operator (Automatic)
                  </h4>
                  <p className="text-sm text-gray-500">
                    System will automatically assign the best available operator
                  </p>
                </div>
                <div className="flex items-center text-green-600">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  <span className="text-xs font-medium">Recommended</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Operator options - only render validated operator objects */}
        {safeOperators.map((operator, idx) => {
          const op = operator as any;

          // safe id/key: prefer id -> code -> fallback op-idx
          const operatorId = (op && (op.id || op.code)) ? (op.id || op.code) : `op-${idx}`;

          // safe name: prefer string fields, else try label/title, else stringify a small sample
          let operatorName: string;
          if (op && typeof op.name === 'string') {
            operatorName = op.name;
          } else if (op && typeof op.label === 'string') {
            operatorName = op.label;
          } else if (op && typeof op.title === 'string') {
            operatorName = op.title;
          } else {
            try {
              operatorName = op ? JSON.stringify(op).slice(0, 60) : operatorId;
            } catch {
              operatorName = operatorId;
            }
          }

          // safe price formatting
          const priceNum = op && op.price != null ? Number(op.price) : NaN;
          const hasPrice = Number.isFinite(priceNum);

          // sanity check: if operatorId is falsy, skip
          if (!operatorId) {
            console.warn('⚠️ Invalid operator object (missing id/code):', operator);
            return null;
          }

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
                    <div className="flex items-center space-x-2">
                      {op?.available !== false ? (
                        <div className="flex items-center text-green-600">
                          <CheckCircle className="h-4 w-4 mr-1" />
                          <span className="text-xs font-medium">Available</span>
                        </div>
                      ) : (
                        <div className="flex items-center text-red-500">
                          <AlertCircle className="h-4 w-4 mr-1" />
                          <span className="text-xs font-medium">Limited</span>
                        </div>
                      )}
                      {hasPrice && (
                        <span className="text-sm font-medium text-gray-900">
                          ${priceNum.toFixed(4)}
                        </span>
                      )}
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
              Different operators may have varying delivery times and success rates. 
              Selecting "Any Operator" allows the system to choose the best available option automatically.
            </p>
          </div>
        </div>
      </div>

      {/* Continue button */}
      {selectedOperator !== null && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <button
            onClick={() => {
              // The selection is already handled by the onClick on each option
              // This could be used for validation or additional actions
            }}
            className="w-full py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
          >
            Continue to Confirmation
          </button>
        </div>
      )}
    </div>
  );
};

export default OperatorSelector;
