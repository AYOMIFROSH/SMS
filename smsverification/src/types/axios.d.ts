import axios from "axios";


declare module 'axios' {
  // Add a metadata field you set in the request interceptor
  export interface AxiosRequestConfig {
    metadata?: {
      startTime: number;
    };
  }
}