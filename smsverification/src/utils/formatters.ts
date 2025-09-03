// src/utils/formatters.ts - Enhanced formatters with Nigerian Naira support
export const formatCurrency = (amount: number, currency: string = 'NGN', decimals: number = 2): string => {
  // Handle Nigerian Naira specifically
  if (currency === 'NGN') {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  }
  
  // Handle USD and other currencies
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
};

export const formatNaira = (amount: number, decimals: number = 2): string => {
  return formatCurrency(amount, 'NGN', decimals);
};

export const formatCompactCurrency = (amount: number, currency: string = 'NGN'): string => {
  const formatter = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  });
  
  return formatter.format(amount);
};

export const formatPhoneNumber = (number: string): string => {
  // Handle Nigerian phone numbers specifically
  const cleaned = number.replace(/\D/g, '');
  
  // Nigerian numbers (11 digits: 0801234567 or 13 digits with country code: 2348012345678)
  if (cleaned.startsWith('234') && cleaned.length === 13) {
    return `+${cleaned}`;
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    return `+234${cleaned.substring(1)}`;
  } else if (cleaned.length === 10 && !cleaned.startsWith('0')) {
    return `+234${cleaned}`;
  }
  
  // Fallback for other formats
  if (cleaned.length >= 10) {
    return `+${cleaned}`;
  }
  
  return number;
};

export const formatDate = (date: string | Date, format: 'short' | 'long' | 'relative' = 'short'): string => {
  const d = new Date(date);
  
  if (format === 'long') {
    return d.toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Africa/Lagos', // Nigerian timezone
    });
  }
  
  if (format === 'relative') {
    return formatTimeAgo(d);
  }
  
  return d.toLocaleDateString('en-NG', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
  });
};

export const formatTimeAgo = (date: string | Date): string => {
  const now = new Date();
  const past = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

  if (diffInSeconds < 60) return 'just now';
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays}d ago`;
  
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `${diffInMonths}mo ago`;
  
  const diffInYears = Math.floor(diffInMonths / 12);
  return `${diffInYears}y ago`;
};

export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${remainingSeconds}s`;
  }
};

export const formatFileSize = (bytes: number): string => {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Bytes';
  
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
};

export const formatPercentage = (value: number, decimals: number = 1): string => {
  return new Intl.NumberFormat('en-NG', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100);
};

export const formatNumber = (value: number, decimals: number = 0): string => {
  return new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

export const formatAccountNumber = (accountNumber: string): string => {
  // Format Nigerian account numbers (usually 10 digits)
  const cleaned = accountNumber.replace(/\D/g, '');
  
  if (cleaned.length === 10) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
  }
  
  return accountNumber;
};

export const formatCardNumber = (cardNumber: string): string => {
  // Format card numbers with spaces
  const cleaned = cardNumber.replace(/\D/g, '');
  return cleaned.replace(/(\d{4})/g, '$1 ').trim();
};

export const formatTransactionReference = (reference: string): string => {
  // Make transaction references more readable
  if (reference.length > 20) {
    return `${reference.substring(0, 8)}...${reference.substring(reference.length - 8)}`;
  }
  return reference;
};

export const formatPaymentMethod = (method: string): string => {
  const methodMap: Record<string, string> = {
    'CARD': 'Card Payment',
    'ACCOUNT_TRANSFER': 'Bank Transfer',
    'USSD': 'USSD',
    'PHONE_NUMBER': 'Mobile Money',
    'BANK_TRANSFER': 'Bank Transfer',
    'MOBILE_MONEY': 'Mobile Money',
  };
  
  return methodMap[method] || method;
};

export const formatPaymentStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    'PENDING': 'Processing',
    'PAID': 'Completed',
    'FAILED': 'Failed',
    'CANCELLED': 'Cancelled',
    'EXPIRED': 'Expired',
    'REVERSED': 'Reversed',
  };
  
  return statusMap[status] || status;
};

// Validation helpers
export const isValidNairaAmount = (amount: number): boolean => {
  return amount >= 100 && amount <= 1000000; // ₦100 to ₦1,000,000
};

export const isValidNigerianPhone = (phone: string): boolean => {
  const cleaned = phone.replace(/\D/g, '');
  
  // Nigerian number patterns
  const patterns = [
    /^234[789][01][0-9]{8}$/, // +234 format
    /^0[789][01][0-9]{8}$/,   // 0 prefix format
    /^[789][01][0-9]{8}$/     // Without prefix
  ];
  
  return patterns.some(pattern => pattern.test(cleaned));
};

// Nigerian banks helper
export const getNigerianBanks = () => [
  { code: '044', name: 'Access Bank' },
  { code: '014', name: 'Afribank Nigeria Plc' },
  { code: '023', name: 'Citibank Nigeria Limited' },
  { code: '050', name: 'Ecobank Nigeria Plc' },
  { code: '011', name: 'First Bank of Nigeria Limited' },
  { code: '214', name: 'First City Monument Bank Limited' },
  { code: '070', name: 'Fidelity Bank Plc' },
  { code: '058', name: 'Guaranty Trust Bank Plc' },
  { code: '030', name: 'Heritage Banking Company Limited' },
  { code: '082', name: 'Keystone Bank Limited' },
  { code: '221', name: 'Stanbic IBTC Bank Plc' },
  { code: '068', name: 'Standard Chartered Bank Nigeria Limited' },
  { code: '232', name: 'Sterling Bank Plc' },
  { code: '033', name: 'United Bank for Africa Plc' },
  { code: '032', name: 'Union Bank of Nigeria Plc' },
  { code: '035', name: 'Wema Bank Plc' },
  { code: '057', name: 'Zenith Bank Plc' },
];

export const getBankNameByCode = (code: string): string => {
  const bank = getNigerianBanks().find(b => b.code === code);
  return bank ? bank.name : code;
};