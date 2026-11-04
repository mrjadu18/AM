export const getPagination = (options = {}) => {
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
export const calculateTotalPages = (total, limit) => {
    return Math.ceil(total / limit);
};
