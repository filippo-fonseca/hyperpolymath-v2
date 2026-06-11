// Shared schema utility for JARVIS tool definitions.
// Extracted here to avoid circular imports: index.ts imports from tool files
// that themselves need toJsonSchema — having both reference this module is clean.
//
// CACHE-CRITICAL: no Date.now() / toISOString() calls allowed.

import { z } from "zod";

export function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  // Zod 4 emits `additionalProperties: false` by default for object schemas.
  // We use `openapi-3.1` target to drop the `$schema` keyword (irrelevant for
  // Anthropic) while preserving the strict-mode guarantees.
  const json = z.toJSONSchema(schema, { target: "openapi-3.1" }) as Record<
    string,
    unknown
  >;
  // Belt-and-braces: ensure additionalProperties is explicitly false.
  json.additionalProperties = false;
  return json;
}
