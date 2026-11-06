import "server-only";
import {
  A2A_VERSION,
  REASON,
  RPC,
  type JsonRpcRequest,
  type StreamResponse,
} from "@/lib/a2a/protocol";
import { A2aError } from "@/lib/server/a2a/stall";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "A2A-Version, A2A-Extensions, ETag",
} as const;

export type Rpc = { id: JsonRpcRequest["id"] | null; extensions: string[] };

export function respond(rpc: Rpc, body: object, status = 200, extra: Record<string, string> = {}) {
  return Response.json(
    { jsonrpc: "2.0", id: rpc.id, ...body },
    {
      status,
      headers: {
        ...cors,
        "A2A-Version": A2A_VERSION,
        ...(rpc.extensions.length && { "A2A-Extensions": rpc.extensions.join(", ") }),
        ...extra,
      },
    },
  );
}

export function rpcError(code: number, message: string, metadata?: Record<string, string>) {
  const reason = REASON[code];
  const data = reason
    ? [
        {
          "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          reason,
          domain: "a2a-protocol.org",
          ...(metadata && { metadata }),
        },
      ]
    : undefined;
  return { code, message, ...(data && { data }) };
}

export const ok = (rpc: Rpc, result: unknown) => respond(rpc, { result });

export const fail = (rpc: Rpc, code: number, message: string, metadata?: Record<string, string>) =>
  respond(rpc, { error: rpcError(code, message, metadata) });

/** SSE stream of JSON-RPC results (SendStreamingMessage / SubscribeToTask). */
export function stream(
  rpc: Rpc,
  run: (send: (event: StreamResponse) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  let live = true;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (chunk: string) => {
        if (!live) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          live = false;
        }
      };
      const event = (out: object) =>
        write(`data: ${JSON.stringify({ jsonrpc: "2.0", id: rpc.id, ...out })}\n\n`);
      const beat = setInterval(() => write(": keep-alive\n\n"), 15_000);
      try {
        await run((result) => event({ result }));
      } catch (err) {
        if (!(err instanceof A2aError)) console.error("a2a stream", err);
        event({
          error:
            err instanceof A2aError
              ? rpcError(err.code, err.message, err.metadata)
              : rpcError(RPC.internal, "the agent failed; try again"),
        });
      } finally {
        clearInterval(beat);
        if (live) {
          live = false;
          controller.close();
        }
      }
    },
    cancel() {
      live = false;
    },
  });
  return new Response(body, {
    headers: {
      ...cors,
      "A2A-Version": A2A_VERSION,
      ...(rpc.extensions.length && { "A2A-Extensions": rpc.extensions.join(", ") }),
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
