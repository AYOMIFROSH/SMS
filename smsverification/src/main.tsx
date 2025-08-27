import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import axios from "axios";
import { Provider } from 'react-redux';
import { store, persistor } from './store/store';
import { PersistGate } from 'redux-persist/integration/react';
import LoadingSpinner from './components/common/LoadingSpinner';
import { tokenManager } from './api/client';

axios.defaults.withCredentials = true; 

// Global listener for session expiration
window.addEventListener('auth:sessionExpired', () => {
  console.log('Session expired detected, purging persisted state...');
  persistor.purge();           // clear persisted redux state
  tokenManager.clearTokens();  // clear in-memory tokens
  window.location.href = '/login'; // redirect to login
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <PersistGate loading={<LoadingSpinner size="lg" />} persistor={persistor}>
        <App />
      </PersistGate>
    </Provider>
  </React.StrictMode>
);
