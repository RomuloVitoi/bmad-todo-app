import { ErrorResponseSchema } from '@todo-app/shared';

export interface ApiErrorOptions {
  statusCode: number;
  message: string;
  requestId?: string;
  code?: string;
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly requestId?: string;
  readonly code?: string;

  constructor(opts: ApiErrorOptions) {
    super(opts.message);
    this.name = 'ApiError';
    this.statusCode = opts.statusCode;
    this.requestId = opts.requestId;
    this.code = opts.code;
    // Preserve `instanceof ApiError` when down-compiled.
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    const requestId = response.headers.get('x-request-id') ?? undefined;
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return new ApiError({
        statusCode: response.status,
        message: `Request failed with status ${response.status}`,
        requestId,
      });
    }
    const parsed = ErrorResponseSchema.safeParse(body);
    if (parsed.success) {
      return new ApiError({
        statusCode: parsed.data.statusCode,
        message: parsed.data.message,
        requestId,
        code: parsed.data.code,
      });
    }
    return new ApiError({
      statusCode: response.status,
      message: `Request failed with status ${response.status}`,
      requestId,
    });
  }
}
