export class ApiResponse {
    success;
    message;
    data;
    pagination;
    constructor(success, message, data, pagination) {
        this.success = success;
        this.message = message;
        this.data = data;
        this.pagination = pagination;
    }
    static success(message, data, pagination) {
        return new ApiResponse(true, message, data, pagination);
    }
    static error(message, data) {
        return new ApiResponse(false, message, data);
    }
}
