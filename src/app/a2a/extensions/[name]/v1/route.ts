import { EXTENSION_DOCS } from "@/lib/a2a/extensions";
import { preflight } from "@/lib/server/a2a/http";

/** Extension Markdown spec at the URI declared on Agent Cards. */
export async function GET(_request: Request, ctx: { params: Promise<{ name: string }> }) {
  const name = (await ctx.params).name;
  if (name !== "bargain" && name !== "directory") {
    return new Response("Unknown extension", { status: 404 });
  }
  return new Response(EXTENSION_DOCS[name], {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
}

export const OPTIONS = preflight;
