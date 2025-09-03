// src/utils/toastHelpers.ts
import toast from "react-hot-toast";

// Info Toast
export const toastInfo = (message: string) =>
  toast(message, {
    icon: 'ℹ️',
    duration: 3000, // 3 seconds
    style: {
      background: '#e0f2fe',  // light blue
      color: '#0369a1',       // blue text
    },
  });

// Warning Toast
export const toastWarning = (message: string) =>
  toast(message, {
    icon: '⚠️',
    duration: 3000, // 3 seconds
    style: {
      background: '#fef3c7',  // light yellow
      color: '#92400e',       // brown text
    },
  });
