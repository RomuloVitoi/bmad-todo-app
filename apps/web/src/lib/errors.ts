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
    const message = messageForStatus(response.status);
    // `code` is diagnostic-only (never shown to the user) — kept from the
    // server envelope when present, e.g. for future log correlation.
    let code: string | undefined;
    try {
      const body: unknown = await response.json();
      const parsed = ErrorResponseSchema.safeParse(body);
      if (parsed.success) code = parsed.data.code;
    } catch {
      // No JSON body, or it didn't match the envelope shape. `.message` is
      // already status-derived above — this catch only affects `code`.
    }
    return new ApiError({
      statusCode: response.status,
      message,
      requestId,
      code,
    });
  }

  // No HTTP response was ever received (fetch() itself rejected — DNS
  // failure, offline, connection refused). Distinct from fromResponse,
  // which requires a Response object. `statusCode: 0` is the sentinel for
  // "no response."
  static networkFailure(): ApiError {
    return new ApiError({
      statusCode: 0,
      message: "You're offline. Your change wasn't saved.",
    });
  }
}

function messageForStatus(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return "That change couldn't be saved.";
    case 404:
      return 'This todo no longer exists.';
    case 429:
      return 'Too many requests — please wait a moment.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
