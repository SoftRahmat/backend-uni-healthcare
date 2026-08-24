export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
    public readonly isOperational = true,
  ) {
    super(message);
    this.name = "ApiError";
    Error.captureStackTrace(this, this.constructor);
  }
}
