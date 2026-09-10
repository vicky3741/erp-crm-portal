/**
 * Errors thrown deliberately by application code.
 * The global error handler turns these into clean JSON responses; anything
 * that is NOT an AppError is treated as an unexpected 500.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational = true;
  public readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', details?: unknown) {
    return new AppError(400, message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError(401, message);
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new AppError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new AppError(404, message);
  }

  static conflict(message = 'Resource already exists', details?: unknown) {
    return new AppError(409, message, details);
  }

  static unprocessable(message = 'Request could not be processed', details?: unknown) {
    return new AppError(422, message, details);
  }

  static internal(message = 'Something went wrong') {
    return new AppError(500, message);
  }
}
