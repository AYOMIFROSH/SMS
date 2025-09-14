// src/pages/Register.tsx - Registration form optimized to fit screen perfectly (no CSS changes needed)
import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useDispatch } from "react-redux";
import toast from "react-hot-toast";
import { PageLoader, ButtonLoader } from "@/components/common/LoadingSpinner";
import { register as registerThunk } from "@/store/slices/authSlice";
import useAuth from "@/hooks/useAuth";
import type { AppDispatch } from "@/store/store";

interface RegisterFormData {
  firstname: string;
  lastname: string;
  username: string;
  email: string;
  phoneCode: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

const COUNTRY_CODES = [
  { code: '+1', country: 'US/CA', name: 'United States/Canada' },
  { code: '+44', country: 'UK', name: 'United Kingdom' },
  { code: '+234', country: 'NG', name: 'Nigeria' },
  { code: '+91', country: 'IN', name: 'India' },
  { code: '+86', country: 'CN', name: 'China' },
  { code: '+49', country: 'DE', name: 'Germany' },
  { code: '+33', country: 'FR', name: 'France' },
  { code: '+81', country: 'JP', name: 'Japan' },
  { code: '+7', country: 'RU', name: 'Russia' },
  { code: '+55', country: 'BR', name: 'Brazil' },
  { code: '+27', country: 'ZA', name: 'South Africa' },
  { code: '+61', country: 'AU', name: 'Australia' },
  { code: '+971', country: 'AE', name: 'UAE' },
];

const Register: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { isAuthenticated, isReady, isInitializing } = useAuth();

  const [formData, setFormData] = useState<RegisterFormData>({
    firstname: "",
    lastname: "",
    username: "",
    email: "",
    phoneCode: "+234",
    phone: "",
    password: "",
    confirmPassword: ""
  });
  const [loading, setLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<Partial<RegisterFormData>>({});

  useEffect(() => {
    if (isAuthenticated && isReady) {
      const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const redirectDelay = isMobile ? 500 : 200;
      
      setTimeout(() => {
        navigate("/", { replace: true });
      }, redirectDelay);
    }
  }, [isAuthenticated, isReady, navigate]);

  const validateForm = (): boolean => {
    const errors: Partial<RegisterFormData> = {};
    
    if (!formData.firstname.trim()) {
      errors.firstname = "Required";
    } else if (!/^[a-zA-Z\s]+$/.test(formData.firstname.trim())) {
      errors.firstname = "Letters only";
    }

    if (!formData.lastname.trim()) {
      errors.lastname = "Required";
    } else if (!/^[a-zA-Z\s]+$/.test(formData.lastname.trim())) {
      errors.lastname = "Letters only";
    }
    
    if (!formData.username.trim()) {
      errors.username = "Required";
    } else if (formData.username.length < 3 || formData.username.length > 30) {
      errors.username = "3-30 chars";
    } else if (!/^[a-zA-Z0-9._-]+$/.test(formData.username)) {
      errors.username = "Invalid format";
    }

    if (!formData.email.trim()) {
      errors.email = "Required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = "Invalid email";
    }

    if (!formData.phone.trim()) {
      errors.phone = "Required";
    } else if (!/^\d{7,15}$/.test(formData.phone)) {
      errors.phone = "7-15 digits";
    }
    
    if (!formData.password) {
      errors.password = "Required";
    } else if (formData.password.length < 6) {
      errors.password = "Min 6 chars";
    } else if (!/^(?=.*[a-zA-Z])(?=.*\d)/.test(formData.password)) {
      errors.password = "Letter + number";
    }

    if (!formData.confirmPassword) {
      errors.confirmPassword = "Required";
    } else if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = "No match";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (field: keyof RegisterFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const value = e.target.value;
    setFormData(prev => ({ ...prev, [field]: value }));
    
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);

    try {
      await dispatch(registerThunk({
        firstname: formData.firstname.trim(),
        lastname: formData.lastname.trim(),
        username: formData.username.trim(),
        email: formData.email.trim(),
        phoneCode: formData.phoneCode,
        phone: formData.phone.trim(),
        password: formData.password,
        confirmPassword: formData.confirmPassword
      })).unwrap();

      toast.success("Registration successful! Welcome to FizzBuzz Platform!");
      
    } catch (error: any) {
      let errorMessage = "Registration failed. Please try again.";
      
      if (error.includes?.('duplicate') || error.includes?.('exists')) {
        errorMessage = "Account already exists";
      } else if (error.includes?.('username')) {
        errorMessage = "Username taken";
      } else if (error.includes?.('email')) {
        errorMessage = "Email already registered";
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      toast.error(errorMessage);
      
    } finally {
      setLoading(false);
    }
  };

  if (isInitializing) {
    return (
      <div 
        className="flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100"
        style={{ height: '100vh', maxHeight: '100vh', overflow: 'hidden' }}
      >
        <div className="text-center">
          <PageLoader message="Checking authentication..." />
        </div>
      </div>
    );
  }

  const isFormValid = Object.values(formData).every(field => field.trim()) && !loading;

  return (
    <div 
      className="flex overflow-hidden bg-gradient-to-br from-blue-50 to-indigo-100"
      style={{ height: '100vh', maxHeight: '100vh' }}
    >
      {/* Left Side - Registration Form */}
      <div className="flex-1 flex items-center justify-center px-3 lg:px-4">
        <div 
          className="w-full max-w-5xl"
          style={{ maxHeight: 'calc(100vh - 2rem)' }}
        >
          {/* Header - Ultra Compact */}
          <div className="mb-2 text-center">
            <h1 className="text-lg lg:text-xl font-bold text-slate-800 mb-1">
              Join FizzBuzz Platform
            </h1>
            <p className="text-xs text-slate-600">
              Create your account for all services
            </p>
          </div>

          {/* Form Container with controlled height */}
          <div 
            className="bg-white rounded-lg shadow-lg overflow-hidden"
            style={{ maxHeight: 'calc(100vh - 8rem)' }}
          >
            <form 
              className="p-3 lg:p-4"
              onSubmit={handleSubmit} 
              noValidate
              style={{ 
                maxHeight: 'calc(100vh - 10rem)', 
                overflowY: 'auto',
                scrollbarWidth: 'thin'
              }}
            >
              {/* Name Fields Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label htmlFor="firstname" className="block text-sm font-medium text-slate-700 mb-1">
                    First Name *
                  </label>
                  <input
                    id="firstname"
                    type="text"
                    value={formData.firstname}
                    onChange={handleInputChange('firstname')}
                    className={`
                      w-full px-3 py-2 text-sm bg-white border rounded-md 
                      focus:outline-none focus:ring-1 transition-all
                      ${formErrors.firstname 
                        ? 'border-red-300 focus:ring-red-500' 
                        : 'border-slate-300 focus:ring-blue-500'
                      }
                    `}
                    placeholder="First name"
                    disabled={loading}
                    autoComplete="given-name"
                  />
                  {formErrors.firstname && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.firstname}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="lastname" className="block text-sm font-medium text-slate-700 mb-1">
                    Last Name *
                  </label>
                  <input
                    id="lastname"
                    type="text"
                    value={formData.lastname}
                    onChange={handleInputChange('lastname')}
                    className={`
                      w-full px-3 py-2 text-sm bg-white border rounded-md 
                      focus:outline-none focus:ring-1 transition-all
                      ${formErrors.lastname 
                        ? 'border-red-300 focus:ring-red-500' 
                        : 'border-slate-300 focus:ring-blue-500'
                      }
                    `}
                    placeholder="Last name"
                    disabled={loading}
                    autoComplete="family-name"
                  />
                  {formErrors.lastname && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.lastname}</p>
                  )}
                </div>
              </div>

              {/* Username and Email Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1">
                    Username *
                  </label>
                  <input
                    id="username"
                    type="text"
                    value={formData.username}
                    onChange={handleInputChange('username')}
                    className={`
                      w-full px-3 py-2 text-sm bg-white border rounded-md 
                      focus:outline-none focus:ring-1 transition-all
                      ${formErrors.username 
                        ? 'border-red-300 focus:ring-red-500' 
                        : 'border-slate-300 focus:ring-blue-500'
                      }
                    `}
                    placeholder="Username"
                    disabled={loading}
                    autoComplete="username"
                  />
                  {formErrors.username && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.username}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange('email')}
                    className={`
                      w-full px-3 py-2 text-sm bg-white border rounded-md 
                      focus:outline-none focus:ring-1 transition-all
                      ${formErrors.email 
                        ? 'border-red-300 focus:ring-red-500' 
                        : 'border-slate-300 focus:ring-blue-500'
                      }
                    `}
                    placeholder="Email"
                    disabled={loading}
                    autoComplete="email"
                  />
                  {formErrors.email && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.email}</p>
                  )}
                </div>
              </div>

              {/* Phone Fields Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label htmlFor="phoneCode" className="block text-sm font-medium text-slate-700 mb-1">
                    Country Code *
                  </label>
                  <select
                    id="phoneCode"
                    value={formData.phoneCode}
                    onChange={handleInputChange('phoneCode')}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md 
                             focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    disabled={loading}
                  >
                    {COUNTRY_CODES.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.code} ({country.country})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1">
                    Phone Number *
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleInputChange('phone')}
                    className={`
                      w-full px-3 py-2 text-sm bg-white border rounded-md 
                      focus:outline-none focus:ring-1 transition-all
                      ${formErrors.phone 
                        ? 'border-red-300 focus:ring-red-500' 
                        : 'border-slate-300 focus:ring-blue-500'
                      }
                    `}
                    placeholder="Phone number"
                    disabled={loading}
                    autoComplete="tel"
                  />
                  {formErrors.phone && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.phone}</p>
                  )}
                </div>
              </div>

              {/* Password Fields Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                    Password *
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={handleInputChange('password')}
                    className={`
                      w-full px-3 py-2 text-sm bg-white border rounded-md 
                      focus:outline-none focus:ring-1 transition-all
                      ${formErrors.password 
                        ? 'border-red-300 focus:ring-red-500' 
                        : 'border-slate-300 focus:ring-blue-500'
                      }
                    `}
                    placeholder="Password"
                    disabled={loading}
                    autoComplete="new-password"
                  />
                  {formErrors.password && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.password}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1">
                    Confirm Password *
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={handleInputChange('confirmPassword')}
                    className={`
                      w-full px-3 py-2 text-sm bg-white border rounded-md 
                      focus:outline-none focus:ring-1 transition-all
                      ${formErrors.confirmPassword 
                        ? 'border-red-300 focus:ring-red-500' 
                        : 'border-slate-300 focus:ring-blue-500'
                      }
                    `}
                    placeholder="Confirm password"
                    disabled={loading}
                    autoComplete="new-password"
                  />
                  {formErrors.confirmPassword && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.confirmPassword}</p>
                  )}
                </div>
              </div>

              {/* Terms - Compact */}
              <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded mb-4">
                <p>
                  By creating account, you agree to our{' '}
                  <Link 
                    to="/terms" 
                    target="_blank" 
                    className="text-blue-600 hover:text-blue-700 underline"
                  >
                    Terms
                  </Link>{' '}
                  and{' '}
                  <Link 
                    to="/privacy" 
                    target="_blank" 
                    className="text-blue-600 hover:text-blue-700 underline"
                  >
                    Privacy Policy
                  </Link>.
                </p>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!isFormValid}
                className={`
                  w-full py-2.5 px-4 text-sm font-semibold rounded-md 
                  transition-all duration-200 flex justify-center items-center 
                  shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
                  ${isFormValid
                    ? 'bg-blue-600 hover:bg-blue-700 text-white hover:shadow-lg'
                    : 'bg-slate-400 cursor-not-allowed text-white'
                  }
                `}
              >
                {loading ? (
                  <>
                    <ButtonLoader />
                    <span className="ml-2">Creating...</span>
                  </>
                ) : (
                  "Create Account"
                )}
              </button>
            </form>
          </div>

          {/* Footer - Ultra Compact */}
          <div className="mt-1 text-center">
            <p className="text-xs text-slate-600">
              Have an account?{' '}
              <Link 
                to="/login" 
                className="text-blue-600 hover:text-blue-700 font-semibold underline"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Right Side - Branding */}
      <div className="hidden lg:flex bg-gradient-to-br from-blue-600 to-indigo-700 items-center justify-center relative overflow-hidden"
           style={{ width: '50%' }}>
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-1/4 left-1/4 w-24 h-24 bg-white rounded-full animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-16 h-16 bg-white rounded-full animate-pulse" 
               style={{animationDelay: '1s'}}></div>
        </div>

        {/* Content - Ultra Compact */}
        <div className="relative text-center text-white z-10 px-4">
          {/* Logo */}
          <div className="mb-3">
            <div className="w-12 h-12 mx-auto bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center mb-3 shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold mb-1">FizzBuzz</h2>
            <p className="text-xs text-blue-100">One Account, All Services</p>
          </div>

          {/* Feature */}
          <div className="flex items-center justify-center space-x-2 text-blue-100 mb-3">
            <svg className="w-3 h-3 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-xs">All Services</span>
          </div>

          {/* Bottom accent */}
          <div className="pt-2 border-t border-blue-400/30">
            <p className="text-xs text-blue-200">
              Trusted worldwide
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;

