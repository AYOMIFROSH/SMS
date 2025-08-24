export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
  },
  DASHBOARD: {
    STATS: '/dashboard/stats',
    ACTIVITY: '/dashboard/activity',
  },
  NUMBERS: {
    PURCHASE: '/numbers/purchase',
    ACTIVE: '/numbers/active',
    HISTORY: '/numbers/history',
    CANCEL: (id: number) => `/numbers/${id}/cancel`,
    COMPLETE: (id: number) => `/numbers/${id}/complete`,
  },
  SERVICES: {
    LIST: '/services',
    COUNTRIES: '/services/countries',
    PRICES: '/services/prices',
    AVAILABILITY: '/services/availability',
  },
  TRANSACTIONS: {
    LIST: '/transactions',
    DEPOSIT: '/transactions/deposit',
  },
};

export const SMS_STATUS = {
  WAITING: 'waiting',
  RECEIVED: 'received',
  USED: 'used',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
} as const;

export const WEBSOCKET_EVENTS = {
  SMS_RECEIVED: 'sms_received',
  NUMBER_PURCHASED: 'number_purchased',
  BALANCE_UPDATED: 'balance_updated',
  NUMBER_EXPIRED: 'number_expired',
} as const;
