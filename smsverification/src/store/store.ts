// src/store/store.ts - Updated store with payment slice
import { configureStore, combineReducers } from '@reduxjs/toolkit';

import authReducer from './slices/authSlice';
import dashboardReducer from './slices/dashboardSlice';
import numbersReducer from './slices/numbersSlice';
import servicesReducer from './slices/servicesSlice';
import paymentReducer from './slices/paymentSlice'; // Add payment slice

// NO PERSISTENCE - rely entirely on httpOnly cookies for session management
const rootReducer = combineReducers({
  auth: authReducer,
  dashboard: dashboardReducer,
  numbers: numbersReducer,
  services: servicesReducer,
  payment: paymentReducer, // Add payment reducer
});

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [
          // Ignore these action types in serializability check
          'payment/fetchBalance/pending',
          'payment/fetchBalance/fulfilled',
          'payment/fetchTransactions/pending',
          'payment/fetchTransactions/fulfilled',
          'payment/createDeposit/pending',
          'payment/createDeposit/fulfilled',
        ],
        ignoredPaths: [
          // Ignore these paths in state
          'payment.balance.created_at',
          'payment.balance.updated_at',
          'payment.transactions',
        ],
      },
    }),
  devTools: import.meta.env.DEV,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;