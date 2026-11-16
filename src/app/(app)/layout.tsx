import { BottomNav } from "@/components/bottom-nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <div className="safe-top mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-28">{children}</div>
      <BottomNav />
    </>
  );
}
