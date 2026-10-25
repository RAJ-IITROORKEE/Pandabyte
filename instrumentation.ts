import type { Instrumentation } from "next";
import { logOperationalFailure } from "./lib/observability/events.ts";

export const onRequestError: Instrumentation.onRequestError = (_error, _request, context) => {
  logOperationalFailure("uncaught_failure", context.routeType);
};
