import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";
import {
  agentOperationNames,
  agentOperations,
  idempotencySchema,
  isMcpOnlyOperation,
} from "./agent-access-contract";

const error = z.object({
  requestId: z.string().uuid(),
  error: z.object({ code: z.string(), message: z.string() }),
});
const genericErrors = {
  400: "Invalid operation input or missing idempotency key",
  401: "Missing, expired or revoked credential",
  403: "Insufficient permission",
  404: "Resource or operation unavailable",
  409: "Idempotency conflict or conflicting state",
  429: "Connection exceeded 60 operation calls in a minute",
  503: "Operation temporarily unavailable",
};

function jsonSchema(schema: z.ZodTypeAny) {
  const { $schema: _schema, ...result } = zodToJsonSchema(schema, {
    $refStrategy: "none",
  });
  return result;
}

export function agentApiPaths() {
  return Object.fromEntries(
    agentOperationNames
      .filter((name) => !isMcpOnlyOperation(name))
      .map((name) => {
        const op = agentOperations[name];
        const parameters =
          op.method === "GET"
            ? Object.entries(op.input.shape).map(([field, schema]) => ({
                name: field,
                in: "query",
                required: !schema.isOptional(),
                schema: jsonSchema(schema),
              }))
            : op.writes
              ? [
                  {
                    name: "Idempotency-Key",
                    in: "header",
                    required: true,
                    description: "Reuse for an exact retry.",
                    schema: jsonSchema(idempotencySchema),
                  },
                ]
              : [];
        return [
          "/api/v1/" + op.path,
          {
            [op.method.toLowerCase()]: {
              operationId: name,
              summary: op.summary,
              parameters,
              security: [{ AgentApiKey: [] }],
              "x-required-scope": op.scope,
              "x-availability": "gated pilot",
              ...(op.method === "POST"
                ? {
                    requestBody: {
                      required: true,
                      content: {
                        "application/json": { schema: jsonSchema(op.input) },
                      },
                    },
                  }
                : {}),
              responses: {
                200: {
                  description: "Successful operation",
                  content: {
                    "application/json": {
                      schema: jsonSchema(
                        z.object({
                          requestId: z.string().uuid(),
                          data: op.output,
                        }),
                      ),
                    },
                  },
                },
                ...Object.fromEntries(
                  Object.entries(genericErrors).map(([status, description]) => [
                    status,
                    {
                      description,
                      content: {
                        "application/json": { schema: jsonSchema(error) },
                      },
                    },
                  ]),
                ),
              },
            },
          },
        ];
      }),
  );
}

export function agentToolReference(origin: string) {
  return {
    name: "AutoSocials",
    stage: "Gated pilot",
    transport: { type: "streamable-http", url: origin + "/mcp" },
    authorization: {
      metadata: origin + "/.well-known/oauth-protected-resource/mcp",
      flow: "OAuth authorization code with S256 PKCE",
    },
    tools: agentOperationNames.map((name) => {
      const op = agentOperations[name];
      return {
        name,
        description: op.summary,
        scope: op.scope,
        idempotency: op.writes
          ? "Required. Reuse the key for an exact retry."
          : "Read-only.",
        inputSchema: jsonSchema(
          op.writes
            ? op.input.extend({ idempotencyKey: idempotencySchema })
            : op.input,
        ),
        outputSchema: jsonSchema(
          z.object({ requestId: z.string().uuid(), data: op.output }),
        ),
      };
    }),
    errors: genericErrors,
  };
}
