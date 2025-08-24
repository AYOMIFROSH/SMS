// src/utils/helper.ts

export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  // Use ReturnType<typeof setTimeout> so it works in both browser and Node typings
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      func(...args);
      timeout = null;
    }, wait);
  };
};

export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
};

export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 11);
};

export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    // avoid scrolling to bottom
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    } catch (fallbackError) {
      document.body.removeChild(textArea);
      return false;
    }
  }
};

export const getCountryName = (countryCode: string): string => {
  const countryNames: { [key: string]: string } = {
    '0': 'Global/International',
    '1': 'United States',
    '2': 'Ukraine',
    '3': 'Russia',
    '6': 'Kazakhstan',
    '7': 'Russia',
    '44': 'United Kingdom',
    '33': 'France',
    '49': 'Germany',
    '34': 'Spain',
    '39': 'Italy',
    '31': 'Netherlands',
    '46': 'Sweden',
    '47': 'Norway',
    '48': 'Poland',
    // Add more as needed
  };
  
  return countryNames[countryCode] || `Country ${countryCode}`;
};
