// src/pages/Login.tsx - Secure login with proper error handling and CSRF protection
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import toast from "react-hot-toast";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { login as loginThunk } from "@/store/slices/authSlice";
import useAuth from "@/hooks/useAuth";
import type { AppDispatch } from "@/store/store";

interface LoginFormData {
  username: string;
  password: string;
}

const Login: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { isAuthenticated, isReady, isInitializing } = useAuth();

  const [formData, setFormData] = useState<LoginFormData>({
    username: "",
    password: ""
  });
  const [loading, setLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<Partial<LoginFormData>>({});

  // Redirect if already authenticated
useEffect(() => {
  if (isAuthenticated && isReady) {
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const redirectDelay = isMobile ? 500 : 200; // Longer delay for mobile
    
    setTimeout(() => {
      navigate("/", { replace: true });
    }, redirectDelay);
  }
}, [isAuthenticated, isReady, navigate]);

  const validateForm = (): boolean => {
    const errors: Partial<LoginFormData> = {};
    
    if (!formData.username.trim()) {
      errors.username = "Username or email is required";
    }
    
    if (!formData.password.trim()) {
      errors.password = "Password is required";
    } else if (formData.password.length < 3) {
      errors.password = "Password must be at least 3 characters";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (field: keyof LoginFormData) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear field error when user starts typing
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);

    try {
      console.log('Attempting login for username:', formData.username);

      await dispatch(loginThunk({
        username: formData.username.trim(),
        password: formData.password
      })).unwrap();

      // toast.success("Login successful!");
      
      // Navigation will be handled by the useEffect above
      
    } catch (error: any) {
      console.error('Login failed:', error);
      
      // Handle specific error types
      let errorMessage = "Login failed. Please try again.";
      
      if (error.includes?.('not found')) {
        errorMessage = "Account not found with this username or email";
      } else if (error.includes?.('password')) {
        errorMessage = "Incorrect password provided";
      } else if (error.includes?.('inactive')) {
        errorMessage = "Account is inactive. Please contact support.";
      } else if (error.includes?.('attempts')) {
        errorMessage = "Too many login attempts. Please try again later.";
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      toast.error(errorMessage);
      
      // Clear password on error
      setFormData(prev => ({ ...prev, password: "" }));
      
    } finally {
      setLoading(false);
    }
  };

  // Show loading state during auth initialization
  if (isInitializing) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-slate-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  const isFormValid = formData.username.trim() && formData.password.trim() && !loading;

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Left Side - Login Form */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 px-8 lg:px-12">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-800 mb-2">
              Welcome back
            </h1>
            <p className="text-slate-600">
              Please sign in to your SMS Security account
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit} noValidate>
            <div>
              <label 
                htmlFor="username" 
                className="block text-sm font-semibold text-slate-700 mb-2"
              >
                Username or Email *
              </label>
              <input
                id="username"
                type="text"
                value={formData.username}
                onChange={handleInputChange('username')}
                className={`
                  w-full px-4 py-3 bg-white border rounded-lg 
                  focus:outline-none focus:ring-2 transition-all duration-200 
                  text-slate-800 placeholder-slate-500
                  ${formErrors.username 
                    ? 'border-red-300 focus:ring-red-500 focus:border-red-500' 
                    : 'border-slate-300 focus:ring-blue-500 focus:border-blue-500'
                  }
                `}
                placeholder="Enter your username or email"
                disabled={loading}
                autoComplete="username"
                required
              />
              {formErrors.username && (
                <p className="mt-1 text-sm text-red-600">{formErrors.username}</p>
              )}
            </div>

            <div>
              <label 
                htmlFor="password" 
                className="block text-sm font-semibold text-slate-700 mb-2"
              >
                Password *
              </label>
              <input
                id="password"
                type="password"
                value={formData.password}
                onChange={handleInputChange('password')}
                className={`
                  w-full px-4 py-3 bg-white border rounded-lg 
                  focus:outline-none focus:ring-2 transition-all duration-200 
                  text-slate-800 placeholder-slate-500
                  ${formErrors.password 
                    ? 'border-red-300 focus:ring-red-500 focus:border-red-500' 
                    : 'border-slate-300 focus:ring-blue-500 focus:border-blue-500'
                  }
                `}
                placeholder="Enter your password"
                disabled={loading}
                autoComplete="current-password"
                required
              />
              {formErrors.password && (
                <p className="mt-1 text-sm text-red-600">{formErrors.password}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={!isFormValid}
              className={`
                w-full py-3 px-4 text-white font-semibold rounded-lg 
                transition-all duration-200 flex justify-center items-center 
                shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                ${isFormValid
                  ? 'bg-blue-600 hover:bg-blue-700 hover:shadow-xl transform hover:-translate-y-0.5'
                  : 'bg-slate-400 cursor-not-allowed'
                }
              `}
              aria-label="Sign in to your account"
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" color="white" />
                  <span className="ml-2">Signing In...</span>
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <div className="mt-8 text-center space-y-4">
            <p className="text-sm text-slate-500">
              Secure authentication with HTTP-only cookies
            </p>
            
            <div className="flex justify-center space-x-4 text-xs text-slate-400">
              <span>CSRF Protected</span>
              <span>•</span>
              <span>End-to-End Encrypted</span>
              <span>•</span>
              <span>Session Secure</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Branding */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-blue-600 to-indigo-700 items-center justify-center relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-white rounded-full animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-white rounded-full animate-pulse" style={{animationDelay: '1s'}}></div>
          <div className="absolute top-3/4 left-1/2 w-32 h-32 bg-white rounded-full animate-pulse" style={{animationDelay: '2s'}}></div>
        </div>

        {/* Content */}
        <div className="relative text-center text-white z-10 max-w-md">
          {/* Logo */}
          <div className="mb-8">
            <div className="w-24 h-24 mx-auto bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-6 shadow-2xl">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h2 className="text-4xl font-bold mb-4">SMS Security</h2>
            <p className="text-xl text-blue-100 mb-8">Professional SMS Verification Platform</p>
          </div>

          {/* Features */}
          <div className="space-y-4">
            <div className="flex items-center space-x-3 text-blue-100">
              <svg className="w-6 h-6 text-blue-200 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Enterprise-grade SMS Verification</span>
            </div>
            <div className="flex items-center space-x-3 text-blue-100">
              <svg className="w-6 h-6 text-blue-200 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Bank-level Security & Encryption</span>
            </div>
            <div className="flex items-center space-x-3 text-blue-100">
              <svg className="w-6 h-6 text-blue-200 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Global Coverage & Fast Delivery</span>
            </div>
            <div className="flex items-center space-x-3 text-blue-100">
              <svg className="w-6 h-6 text-blue-200 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span>Real-time Analytics & Monitoring</span>
            </div>
          </div>

          {/* Bottom accent */}
          <div className="mt-8 pt-6 border-t border-blue-400/30">
            <p className="text-sm text-blue-200">
              Trusted by developers worldwide
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;