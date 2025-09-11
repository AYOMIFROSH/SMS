// src/store/store.ts - Updated store with payment slice
import { configureStore, combineReducers } from '@reduxjs/toolkit';

import authReducer from './slices/authSlice';
import dashboardReducer from './slices/dashboardSlice';
import numbersReducer from './slices/numbersSlice';
import servicesReducer from './slices/servicesSlice';
import paymentReducer from './slices/paymentSlice';

// NO PERSISTENCE - rely entirely on httpOnly cookies for session management
const rootReducer = combineReducers({
  auth: authReducer,
  dashboard: dashboardReducer,
  numbers: numbersReducer,
  services: servicesReducer,
  payment: paymentReducer, // New payment slice
});

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [
          // Ignore payment-related actions with non-serializable payloads
          'payment/setLoading',
          'payment/updateBalance',
          'payment/addTransaction',
          'payment/updateTransactionStatus'
        ],
        ignoredPaths: [
          // Ignore certain paths in state that might contain non-serializable data
          'payment.transactions.meta',
          'payment.lastUpdated'
        ],
      },
    }),
  devTools: import.meta.env.DEV,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;