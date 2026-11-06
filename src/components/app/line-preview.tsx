import { T, type Msg } from "@/lib/i18n";
import type { LastLine } from "@/lib/server/bargains";

/** The latest chat line, prefixed with who said it, as one line of preview text. */
export function LinePreview({ line, stall }: { line: LastLine | null; stall: string }) {
  if (!line) return null;
  const who =
    line.speaker === "agent" ? (
      <T msg="Your agent" />
    ) : line.speaker === "buyer" ? (
      <T msg="You" />
    ) : (
      stall
    );
  const body = line.msg ? <T msg={line.msg as Msg} vars={line.vars ?? undefined} /> : line.text;
  return (
    <>
      <span className="font-medium text-foreground/80">{who}:</span> {body}
    </>
  );
}
