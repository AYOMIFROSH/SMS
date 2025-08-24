// src/components/common/LoadingSpinner.tsx - Enhanced loading spinner component
import React from 'react';

interface LoadingSpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  color?: 'primary' | 'white' | 'gray' | 'blue' | 'green' | 'red' | 'yellow';
  className?: string;
  text?: string;
  overlay?: boolean;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  color = 'primary',
  className = '',
  text,
  overlay = false
}) => {
  // Size classes
  const sizeClasses = {
    xs: 'h-3 w-3',
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
    xl: 'h-12 w-12'
  };

  // Color classes
  const colorClasses = {
    primary: 'border-primary-600',
    white: 'border-white',
    gray: 'border-gray-600',
    blue: 'border-blue-600',
    green: 'border-green-600',
    red: 'border-red-600',
    yellow: 'border-yellow-600'
  };

  // Text size classes based on spinner size
  const textSizeClasses = {
    xs: 'text-xs',
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl'
  };

  const spinnerClasses = `
    animate-spin rounded-full border-2 border-transparent
    ${sizeClasses[size]}
    ${colorClasses[color]}
    border-t-current
    ${className}
  `.trim();

  const content = (
    <div className="flex flex-col items-center justify-center space-y-2">
      <div className={spinnerClasses} />
      {text && (
        <p className={`text-gray-600 font-medium ${textSizeClasses[size]}`}>
          {text}
        </p>
      )}
    </div>
  );

  if (overlay) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 shadow-xl">
          {content}
        </div>
      </div>
    );
  }

  return content;
};

// Specialized loading components for common use cases
export const PageLoader: React.FC<{ message?: string }> = ({ message = "Loading..." }) => (
  <div className="min-h-[400px] flex items-center justify-center">
    <LoadingSpinner size="lg" text={message} />
  </div>
);

export const ButtonLoader: React.FC<{ size?: 'xs' | 'sm' | 'md' }> = ({ size = 'sm' }) => (
  <LoadingSpinner size={size} color="white" />
);

export const OverlayLoader: React.FC<{ message?: string }> = ({ message = "Processing..." }) => (
  <LoadingSpinner size="lg" text={message} overlay />
);

export const InlineLoader: React.FC<{ 
  size?: 'xs' | 'sm' | 'md'; 
  text?: string; 
  className?: string; 
}> = ({ size = 'sm', text, className = '' }) => (
  <div className={`flex items-center space-x-2 ${className}`}>
    <LoadingSpinner size={size} />
    {text && <span className="text-sm text-gray-600">{text}</span>}
  </div>
);

// Card loader for skeleton-like loading states
export const CardLoader: React.FC = () => (
  <div className="animate-pulse">
    <div className="bg-gray-200 rounded-lg h-32 mb-4"></div>
    <div className="space-y-2">
      <div className="bg-gray-200 h-4 rounded w-3/4"></div>
      <div className="bg-gray-200 h-4 rounded w-1/2"></div>
    </div>
  </div>
);

// Table row loader
export const TableRowLoader: React.FC<{ columns?: number }> = ({ columns = 4 }) => (
  <tr className="animate-pulse">
    {Array.from({ length: columns }).map((_, index) => (
      <td key={index} className="px-6 py-4">
        <div className="bg-gray-200 h-4 rounded"></div>
      </td>
    ))}
  </tr>
);

export default LoadingSpinner;