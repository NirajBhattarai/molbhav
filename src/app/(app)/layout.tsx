import { Suspense } from "react";
import { TabBar } from "@/components/app/tab-bar";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <TabBar />
      </Suspense>
    </>
  );
}
