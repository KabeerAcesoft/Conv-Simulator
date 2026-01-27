import { HttpService } from '@nestjs/axios';
import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import Bottleneck from 'bottleneck';
import { catchError, firstValueFrom } from 'rxjs';

@Injectable()
export class APIService {
  private limiter: Bottleneck;

  constructor(private readonly httpService: HttpService) {
    this.limiter = new Bottleneck({
      maxConcurrent: 5, // Adjust as needed
      minTime: 100, // Adjust as needed
    });
  }

  returnErrorMessage(error: any): {
    data: any;
    status: number;
    statusText: string;
  } {
    const statusText =
      error.response?.statusText ||
      error.response?.message ||
      'Internal Server Error';

    const status = error.response?.status || 500;

    return {
      status,
      statusText,
      data: error.response?.data || {},
    };
  }

  async makeApiCall<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.limiter.schedule(async () => {
      const response = await firstValueFrom(
        this.httpService.request<T>(config).pipe(
          catchError((error: AxiosError) => {
            const errorInfo = this.returnErrorMessage(error);
            const errorMessage = `${errorInfo.statusText} (${errorInfo.status}): ${JSON.stringify(errorInfo.data)}`;

            const exception = new InternalServerErrorException(errorMessage);

            // Attach the structured error info for downstream handlers
            (exception as any).response = errorInfo;

            throw exception;
          }),
        ),
      );

      return response;
    });
  }

  async post<T>(
    url: string,
    data: any,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    try {
      const requestConfig: AxiosRequestConfig = {
        method: 'POST',
        url,
        data,
        ...config,
      };

      return await this.makeApiCall<T>(requestConfig);
    } catch (error) {
      console.trace('Error in POST request:', error);
      throw error;
    }
  }

  async get<T>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    try {
      const requestConfig: AxiosRequestConfig = {
        method: 'GET',
        url,
        ...config,
      };

      return await this.makeApiCall<T>(requestConfig);
    } catch (error) {
      console.error('Error in GET request:', error);
      throw error;
    }
  }

  async put<T>(
    url: string,
    data: any,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    try {
      const requestConfig: AxiosRequestConfig = {
        method: 'PUT',
        url,
        data,
        ...config,
      };

      return await this.makeApiCall<T>(requestConfig);
    } catch (error) {
      console.error('Error in PUT request:', error);
      throw error;
    }
  }

  async delete<T>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    try {
      const requestConfig: AxiosRequestConfig = {
        method: 'DELETE',
        url,
        ...config,
      };

      return await this.makeApiCall<T>(requestConfig);
    } catch (error) {
      console.error('Error in DELETE request:', error);
      throw error;
    }
  }

  async patch<T>(
    url: string,
    data: any,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    try {
      const requestConfig: AxiosRequestConfig = {
        method: 'PATCH',
        url,
        data,
        ...config,
      };

      return await this.makeApiCall<T>(requestConfig);
    } catch (error) {
      console.error('Error in PATCH request:', error);
      throw error;
    }
  }
}
