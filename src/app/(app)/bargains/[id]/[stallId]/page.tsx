import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HaggleChat } from "@/components/app/haggle-chat";
import { Screen } from "@/components/app/screen";
import { T } from "@/lib/i18n";
import { me, myChat } from "@/lib/server/bargains";
import { rupees } from "@/lib/want";

async function ChatContent({ params }: { params: Promise<{ id: string; stallId: string }> }) {
  const { id, stallId } = await params;
  const chat = await myChat(await me(), id, stallId);
  if (!chat) notFound();

  return (
    <Screen
      title={chat.stall.name}
      back={`/bargains/${id}`}
      className="pb-[calc(7rem+env(safe-area-inset-bottom))]"
    >
      <p className="-mt-2 mb-4 text-sm text-muted-foreground">
        {chat.item}
        {chat.current !== null && (
          <>
            {" · "}
            <span className="font-semibold text-foreground tabular-nums">
              {rupees(chat.current)}
            </span>
          </>
        )}
        {chat.budget !== null && (
          <>
            {" · "}
            <T msg="Your budget" /> {rupees(chat.budget)}
          </>
        )}
      </p>
      <HaggleChat chat={chat} />
    </Screen>
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
