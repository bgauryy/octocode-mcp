/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'express' {
  import { IncomingMessage, ServerResponse } from 'http';

  export interface Request extends IncomingMessage {
    query: Record<string, any>;
    params: Record<string, string>;
    body: any;
    method: string;
    path: string;
  }

  export interface Response extends ServerResponse {
    status(code: number): Response;
    json(body: any): Response;
    send(body: any): Response;
  }

  export type NextFunction = (err?: any) => void;

  export type RequestHandler = (
    req: Request,
    res: Response,
    next: NextFunction
  ) => void | Promise<void>;

  export type ErrorRequestHandler = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
  ) => void | Promise<void>;

  export interface Router {
    get(path: string, ...handlers: RequestHandler[]): Router;
    post(path: string, ...handlers: RequestHandler[]): Router;
    put(path: string, ...handlers: RequestHandler[]): Router;
    delete(path: string, ...handlers: RequestHandler[]): Router;
    use(...handlers: (RequestHandler | ErrorRequestHandler)[]): Router;
  }

  export interface Express {
    listen(port: number, callback?: () => void): void;
    get(path: string, handler: RequestHandler): Express;
    use(path: string, router: Router): Express;
    use(handler: RequestHandler | ErrorRequestHandler): Express;
  }

  interface ExpressFunction {
    (): Express;
    Router(): Router;
    json(): RequestHandler;
  }

  const express: ExpressFunction;
  export default express;
  export function Router(): Router;
}

declare module 'qs' {
  export interface ParsedQs {
    [key: string]: any;
  }
}
