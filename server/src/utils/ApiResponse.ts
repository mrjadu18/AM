export class ApiResponse<T = any> {
  success: boolean;
  message: string;
  data: T;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };

  constructor(success: boolean, message: string, data: T, pagination?: any) {
    this.success = success;
    this.message = message;
    this.data = data;
    this.pagination = pagination;
  }

  static success<T>(message: string, data: T, pagination?: any): ApiResponse<T> {
    return new ApiResponse<T>(true, message, data, pagination);
  }

  static error(message: string, data?: any): ApiResponse {
    return new ApiResponse(false, message, data);
  }
}
