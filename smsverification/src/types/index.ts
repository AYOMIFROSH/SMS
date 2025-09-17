// src/types.ts - Enhanced with new interfaces and security features
export interface User {
  id: number;
  username: string;
  email: string;
  firstname?: string;
  lastname?: string;
  role: 'user' | 'admin' | 'moderator';
  balance?: number;
  lastLogin?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  csrfToken: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  initialized: boolean;
  error: string | null;
}

export interface NumberPurchase {
  id: number;
  activation_id: string;
  phone_number: string;
  country_code: string;
  service_name: string;
  service_code: string;
  operator?: string;
  price: number;
  status: 'waiting' | 'received' | 'cancelled' | 'expired' | 'used';
  sms_code?: string | null;
  sms_text?: string | null;
  purchase_date: string;
  expiry_date?: string;
  received_at?: string | null;
  time_remaining?: number;
}

// src/types.ts
export interface Service {
  id?: string;        // <- optional alias from older API shape
  code: string;
  title?: string;     // <- optional alias for 'name'
  name: string;
  icon?: string;
  category?: string;
  price?: number;
  available?: number;
  popular?: boolean;
  isFavorite?: boolean;
}


export interface Country {
  code: string;
  name: string;
  rus?: string;
  flag?: string;
  visible?: boolean;
  recentUsage?: number;
  isRecent?: boolean;
}

export interface Operator {
  id: string;
  name: string;
  country: string;
  available?: boolean;
  price?: number;
}

export interface DashboardStats {
  balance: number;
  activeNumbers: number;
  todayPurchases: number;
  todaySpent: number;
  successRate: number;
  totalNumbers: number;
  totalSpent: number;
}

export interface Transaction {
  id: number;
  user_id: number;
  transaction_type: 'deposit' | 'purchase' | 'refund';
  amount: number;
  balance_before: number;
  balance_after: number;
  reference_id?: string;
  description?: string;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
}

export interface Subscription {
  id: number;
  subscriptionId: string;
  service: string;
  country: string;
  status: 'active' | 'cancelled' | 'expired';
  price: number;
  period: number;
  startDate: string;
  endDate: string;
  daysRemaining?: number;
}

export interface ServiceRestrictions {
  serviceAvailable: boolean;
  availableOperators?: number;
  currentStock?: number;
  priceRange?: {
    min: number;
    max: number;
    average: number;
  };
  recommendations?: Array<{
    type: 'tip' | 'warning' | 'info';
    message: string;
    action?: string;
  }>;
}

export interface PriceInfo {
  cost: number;
  count: number;
  available: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;            // <-- made optional
  message?: string;
  error?: string;
  code?: string;
  requestId?: string;
}


export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface WebSocketMessage {
  type: 'connection_established' | 'sms_received' | 'number_purchased' | 
        'balance_updated' | 'number_expired' | 'sms_webhook_update' | 'error' | 'ping' | 'pong';
  data: any;
  timestamp?: string;
  userId?: number;
}

export interface SMSReceivedMessage {
  activationId: string;
  code: string;
  smsText?: string;
  timestamp: string;
  phoneNumber?: string;
}

export interface NumberPurchasedMessage {
  activationId: string;
  number: string;
  service: string;
  country: string;
  operator?: string;
  price: number;
  timestamp: string;
}

export interface BalanceUpdatedMessage {
  balance: number;
  previousBalance?: number;
  change: number;
  reason: string;
  timestamp: string;
}

export interface NumberExpiredMessage {
  activationId: string;
  phoneNumber: string;
  service: string;
  timestamp: string;
}

// Error interfaces for better error handling
export interface ApiError {
  error: string;
  code: string;
  message: string;
  requestId?: string;
  details?: any;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface InsufficientBalanceError extends ApiError {
  required: number;
  current: number;
  shortfall: number;
}

export interface PriceExceededError extends ApiError {
  currentPrice: number;
  maxPrice: number;
}

// Settings interfaces
export interface UserSettings {
  id: number;
  user_id: number;
  notifications_enabled: boolean;
  email_notifications: boolean;
  webhook_url?: string;
  api_key?: string;
  favorites: string[];
  preferences: {
    defaultCountry?: string;
    autoRefresh: boolean;
    theme: 'light' | 'dark';
  };
}

export interface FavoriteService {
  service_code: string;
  service_name: string;
  added_at: string;
}

// Purchase request interface
export interface PurchaseRequest {
  service: string;
  country?: string;
  operator?: string;
  maxPrice?: number;
}

// Purchase response interface
export interface PurchaseResponse {
  activationId: string;
  number: string;
  price: number;
  purchaseId: number;
  service: string;
  country: string;
  operator?: string;
  status: string;
  expiryDate: string;
  remainingBalance: number;
}

// Subscription interfaces
export interface SubscriptionRequest {
  service: string;
  country: string;
  period: number;
}

export interface SubscriptionResponse {
  subscriptionId: string;
  internalId: number;
  service: string;
  country: string;
  period: number;
  price: number;
  startDate: string;
  endDate: string;
  status: 'active';
}

// Activity interfaces
export interface ActivityItem {
  id: number;
  type: 'purchase' | 'received' | 'cancelled' | 'expired';
  phoneNumber?: string;
  serviceName: string;
  countryCode: string;
  status: string;
  price?: number;
  smsCode?: string;
  purchaseDate: string;
  description?: string;
}

// Health check interface
export interface HealthStatus {
  status: 'OK' | 'WARNING' | 'ERROR';
  timestamp: string;
  version: string;
  environment: string;
  uptime: number;
  memory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
  websocket?: {
    connected: number;
    users: number;
  };
}

// Test results interface
export interface TestResults {
  timestamp: string;
  tests: {
    [key: string]: {
      success: boolean;
      data?: any;
      message: string;
      error?: string;
    };
  };
  summary: {
    overallStatus: 'HEALTHY' | 'WARNING' | 'ERROR';
    successRate: string;
    percentage: number;
    recommendations: string[];
  };
}

// Constants
export const SMS_STATUS = {
  WAITING: 'waiting',
  RECEIVED: 'received',
  USED: 'used',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
} as const;

export type SMSStatus = typeof SMS_STATUS[keyof typeof SMS_STATUS];

export const WEBSOCKET_EVENTS = {
  CONNECTION_ESTABLISHED: 'connection_established',
  SMS_RECEIVED: 'sms_received',
  NUMBER_PURCHASED: 'number_purchased',
  BALANCE_UPDATED: 'balance_updated',
  NUMBER_EXPIRED: 'number_expired',
  SMS_WEBHOOK_UPDATE: 'sms_webhook_update',
  ERROR: 'error',
  PING: 'ping',
  PONG: 'pong',
} as const;

export type WebSocketEventType = typeof WEBSOCKET_EVENTS[keyof typeof WEBSOCKET_EVENTS];

export const USER_ROLES = {
  USER: 'user',
  ADMIN: 'admin',
  MODERATOR: 'moderator',
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

export const TRANSACTION_TYPES = {
  DEPOSIT: 'deposit',
  PURCHASE: 'purchase',
  REFUND: 'refund',
} as const;

export type TransactionType = typeof TRANSACTION_TYPES[keyof typeof TRANSACTION_TYPES];

export const TRANSACTION_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type TransactionStatus = typeof TRANSACTION_STATUS[keyof typeof TRANSACTION_STATUS];