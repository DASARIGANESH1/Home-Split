import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Application error with an attached HTTP status code and a public message.
 * Internal details are never leaked — only `message` is sent to the client.
 */
export class HttpError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;

  constructor(status: ContentfulStatusCode, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (code: string, message: string) => new HttpError(400, code, message);
export const notFound = (code: string, message: string) => new HttpError(404, code, message);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);
export const unprocessable = (code: string, message: string) => new HttpError(422, code, message);

/** True if the thrown value is an HttpError. */
export function isHttpError(e: unknown): e is HttpError {
  return e instanceof HttpError;
}
