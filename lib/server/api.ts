import type {
  ApiErrorCode,
  ApiErrorResponse,
  JsonValue,
} from "./contracts";

export class ApiProblem extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: Record<string, JsonValue>;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    details?: Record<string, JsonValue>,
  ) {
    super(message);
    this.name = "ApiProblem";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function json<T>(body: T, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function invalid(message: string): never {
  throw new ApiProblem(400, "INVALID_INPUT", message);
}

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ApiProblem(
      400,
      "BAD_JSON",
      "Content-Type must be application/json.",
    );
  }

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiProblem(400, "BAD_JSON", "Request body is not valid JSON.");
  }

  if (!isPlainObject(value)) {
    throw new ApiProblem(400, "INVALID_INPUT", "JSON body must be an object.");
  }
  return value;
}

export function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  const unknownKeys = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknownKeys.length > 0) {
    invalid(`Unknown field${unknownKeys.length > 1 ? "s" : ""}: ${unknownKeys.join(", ")}.`);
  }
}

export function requiredString(
  value: unknown,
  field: string,
  options: { min?: number; max: number; pattern?: RegExp },
): string {
  if (typeof value !== "string") invalid(`${field} must be a string.`);
  const normalized = value.trim();
  const min = options.min ?? 1;
  if (normalized.length < min || normalized.length > options.max) {
    invalid(`${field} must be between ${min} and ${options.max} characters.`);
  }
  if (options.pattern && !options.pattern.test(normalized)) {
    invalid(`${field} has an invalid format.`);
  }
  return normalized;
}

export function requiredInteger(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    invalid(`${field} must be an integer between ${min} and ${max}.`);
  }
  return value as number;
}

export function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") invalid(`${field} must be a boolean.`);
  return value;
}

export function requiredStringArray(
  value: unknown,
  field: string,
  min: number,
  max: number,
): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    invalid(`${field} must contain between ${min} and ${max} strings.`);
  }
  if (!value.every((item) => typeof item === "string" && item === item.trim())) {
    invalid(`${field} must contain only non-padded strings.`);
  }
  return value as string[];
}

export function requiredRecord(
  value: unknown,
  field: string,
): Record<string, JsonValue> {
  if (!isPlainObject(value) || !isJsonValue(value)) {
    invalid(`${field} must be a JSON object.`);
  }
  const encoded = JSON.stringify(value);
  if (encoded.length > 200_000) {
    invalid(`${field} must be at most 200000 encoded characters.`);
  }
  return value as Record<string, JsonValue>;
}

export function enumValue<const T extends readonly string[]>(
  value: unknown,
  field: string,
  allowed: T,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    invalid(`${field} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T[number];
}

export function strictSearchParams(
  request: Request,
  allowed: readonly string[],
): URLSearchParams {
  const params = new URL(request.url).searchParams;
  const allowedSet = new Set(allowed);
  for (const key of params.keys()) {
    if (!allowedSet.has(key)) invalid(`Unknown query parameter: ${key}.`);
    if (params.getAll(key).length !== 1) {
      invalid(`Query parameter ${key} may only be provided once.`);
    }
  }
  return params;
}

export function parseLimit(value: string | null, fallback = 30): number {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) invalid("limit must be an integer between 1 and 50.");
  return requiredInteger(Number(value), "limit", 1, 50);
}

export function routeError(error: unknown): Response {
  if (error instanceof ApiProblem) {
    const body: ApiErrorResponse = {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    };
    return json(body, { status: error.status });
  }

  console.error("Unhandled API error", error);
  const body: ApiErrorResponse = {
    error: {
      code: "INTERNAL_ERROR",
      message: "The server could not complete the request.",
    },
  };
  return json(body, { status: 500 });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 50) return false;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item, depth + 1));
  }
  if (isPlainObject(value)) {
    return Object.values(value).every((item) => isJsonValue(item, depth + 1));
  }
  return false;
}
