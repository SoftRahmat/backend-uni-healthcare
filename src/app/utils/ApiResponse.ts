export type PaginationMetadata = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type SuccessResponse<T> = {
  success: true;
  message: string;
  data: T;
  meta?: PaginationMetadata;
};

export type ErrorResponse = {
  success: false;
  message: string;
  error: {
    code: string;
    details?: unknown;
  };
  statusCode: number;
  requestId: string;
};

export const successResponse = <T>(
  message: string,
  data: T,
  meta?: PaginationMetadata,
): SuccessResponse<T> => ({
  success: true,
  message,
  data,
  ...(meta ? { meta } : {}),
});

export const errorResponse = (
  message: string,
  code: string,
  statusCode: number,
  requestId: string,
  details?: unknown,
): ErrorResponse => ({
  success: false,
  message,
  error: {
    code,
    ...(details === undefined ? {} : { details }),
  },
  statusCode,
  requestId,
});
