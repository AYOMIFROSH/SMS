// src/store/store.ts - Simplified store without token persistence
import { configureStore, combineReducers } from '@reduxjs/toolkit';

import authReducer from './slices/authSlice';
import dashboardReducer from './slices/dashboardSlice';
import numbersReducer from './slices/numbersSlice';
import servicesReducer from './slices/servicesSlice';

// NO PERSISTENCE - rely entirely on httpOnly cookies for session management
const rootReducer = combineReducers({
  auth: authReducer,
  dashboard: dashboardReducer,
  numbers: numbersReducer,
  services: servicesReducer,
});

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [],
      },
    }),
  devTools: import.meta.env.DEV,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;