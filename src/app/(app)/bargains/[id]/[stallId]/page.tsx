import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HaggleChat } from "@/components/app/haggle-chat";
import { me, myChat } from "@/lib/server/bargains";

async function ChatContent({ params }: { params: Promise<{ id: string; stallId: string }> }) {
  const { id, stallId } = await params;
  const chat = await myChat(await me(), id, stallId);
  if (!chat) notFound();

  return <HaggleChat chat={chat} />;
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
