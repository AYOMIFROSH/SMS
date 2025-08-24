export const validateApiKey = (apiKey: string): boolean => {
  // SMS-Activate API keys are typically 32 characters
  return apiKey.length >= 20 && /^[a-zA-Z0-9]+$/.test(apiKey);
};

export const validatePhoneNumber = (phone: string): boolean => {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
};

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePassword = (password: string): boolean => {
  return password.length >= 6;
};