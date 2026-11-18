/** Small wrapper shared by the portal routes: config check + uniform error handling. */

import { getConfig, isDatabaseConfigured } from "./config";
import { notConfigured, serverError } from "./http";

export type RouteContext<P extends Record<string, string> = Record<string, never>> = {
  params: Promise<P>;
};

export function route<P extends Record<string, string> = Record<string, never>>(
  scope: string,
  handler: (request: Request, context: RouteContext<P>) => Promise<Response>,
) {
  return async (request: Request, context: RouteContext<P>): Promise<Response> => {
    try {
      if (!isDatabaseConfigured(getConfig())) return notConfigured();
      return await handler(request, context);
    } catch (error) {
      return serverError(scope, error);
    }
  };
}
