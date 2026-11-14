export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiFailure = {
  success: false;
  error: {
    /** English, for logs and API callers. The storefront never shows it. */
    message: string;
    /** One of API_ERROR_CODES (lib/api-error-codes.ts). */
    code: string;
    /**
     * Which rule refused the request, when one code covers several: a
     * CONFLICT's "alreadyBooked" or "pendingLimitContact", a validation
     * error's "pickupInPast" or Zod's "too_small". Additive and optional.
     */
    reason?: string;
    /** The input path a validation error is about, e.g. "customer.email". */
    field?: string;
    /** Numbers the message mentions, e.g. { count: 3 }. */
    params?: Record<string, number>;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
};
