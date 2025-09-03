import 'axios';
import { ApiError, ApiResponse } from './index'; // adjust path if needed

declare module 'axios' {
  export interface AxiosRequestConfig {
    metadata?: {
      startTime: number;
    };
  }

  export interface AxiosResponse<T = any> {
    data: ApiResponse<T>;
  }

  export interface AxiosError<T = any> {
    response?: {
      data: ApiError;   
      status: number;
      headers: any;
      config: AxiosRequestConfig;
    };
  }
}
