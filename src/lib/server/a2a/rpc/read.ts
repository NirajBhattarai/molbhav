import "server-only";
import { A2A_VERSION, RPC, type JsonRpcRequest } from "@/lib/a2a/protocol";
import { INTERNAL_HEADER, internalRole, type InternalRole } from "@/lib/server/a2a/keys";
import { fail, respond, rpcError, type Rpc } from "@/lib/server/a2a/rpc/respond";
import { withinLimit } from "@/lib/server/rate-limit";

const PER_MINUTE = 240;

export type ReadRpc =
  | Response
  | {
      rpc: Rpc;
      method: string;
      params: Record<string, unknown>;
      from: InternalRole | null;
    };

/** Parse JSON-RPC body; check A2A-Version, required extension, and rate limit. */
export async function readRpc(request: Request, requiredExt: string): Promise<ReadRpc> {
  const version =
    request.headers.get("A2A-Version") ??
    new URL(request.url).searchParams.get("A2A-Version") ??
    "";
  if (!version.split(",").some((v) => v.trim() === A2A_VERSION)) {
    return fail(
      { id: null, extensions: [] },
      RPC.versionNotSupported,
      `A2A version ${version.trim() || "0.3 (no A2A-Version header)"} isn't supported; send A2A-Version: ${A2A_VERSION}`,
      { supportedVersions: A2A_VERSION },
    );
  }

  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return fail({ id: null, extensions: [] }, RPC.parse, "invalid JSON");
  }
  if (body?.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return fail(
      { id: body?.id ?? null, extensions: [] },
      RPC.invalidRequest,
      "expected JSON-RPC 2.0 with a method",
    );
  }

  const headerExt = (request.headers.get("A2A-Extensions") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!headerExt.includes(requiredExt)) {
    return fail(
      { id: body.id ?? null, extensions: [] },
      RPC.extensionSupportRequired,
      `send A2A-Extensions: ${requiredExt}`,
      { requiredExtension: requiredExt },
    );
  }

  const from = internalRole(request.headers.get(INTERNAL_HEADER));
  if (!from) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
    if (!(await withinLimit(`a2a:${ip}`, PER_MINUTE, 60))) {
      return respond(
        { id: body.id ?? null, extensions: [requiredExt] },
        { error: rpcError(RPC.internal, "too many requests; try again in a minute") },
        429,
      );
    }
  }

  return {
    rpc: { id: body.id ?? null, extensions: [requiredExt] },
    method: body.method,
    params: (body.params ?? {}) as Record<string, unknown>,
    from,
  };
}
