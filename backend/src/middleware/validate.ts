import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny } from 'zod';

export interface RequestSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validates and REPLACES the request parts it is given.
 *
 * Replacing matters: Zod strips unknown keys and coerces types, so downstream
 * handlers receive exactly the shape the schema describes — a query string
 * "page=2" arrives as the number 2, and a client cannot smuggle extra fields
 * into a create or update call.
 *
 * ZodErrors are forwarded to the global error handler, which renders them as
 * a 400 with a per-field message list.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as typeof req.query;
      }
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
