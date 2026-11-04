export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationResult {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  skip: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const getPagination = (options: PaginationOptions = {}): PaginationResult => {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 10));
  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
    total: 0,
    totalPages: 0,
    sortBy: options.sortBy,
    sortOrder: options.sortOrder || 'desc',
  };
};

export const calculateTotalPages = (total: number, limit: number): number => {
  return Math.ceil(total / limit);
};
