import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HaggleChat } from "@/components/app/haggle-chat";
import { autoOrderOf, autoOrderStep } from "@/lib/server/auto-order";
import { me, myChat } from "@/lib/server/bargains";
import { dealLogUrl } from "@/lib/server/hedera/deal-log";
import { payingBreaks } from "@/lib/server/limits";

async function ChatContent({ params }: { params: Promise<{ id: string; stallId: string }> }) {
  const { id, stallId } = await params;
  const user = await me();
  // Plan the agent's order here too: buyers often watch the haggle in this chat, not the list.
  await autoOrderStep(user.id, id).catch((err) => console.error("auto-order", err));
  const [chat, order] = await Promise.all([
    myChat(user, id, stallId),
    autoOrderOf(user.id, id).catch(() => null),
  ]);
  if (!chat) notFound();
  const overLimit =
    chat.status === "agreed" && chat.current !== null
      ? await payingBreaks(user.id, chat.current)
      : null;

  return (
    <HaggleChat
      chat={chat}
      overLimit={overLimit}
      autoOrder={order?.autoOrder ?? false}
      auto={order?.auto ?? null}
      dealLog={dealLogUrl()}
    />
  );
}

export default async function StallChatPage({
  params,
}: {
  params: Promise<{ id: string; stallId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto min-h-dvh w-full max-w-md animate-pulse px-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="mb-6 h-11 w-1/2 rounded-lg bg-muted" />
          <div className="h-40 rounded-xl bg-muted" />
        </main>
      }
    >
      <ChatContent params={params} />
    </Suspense>
  );
}
