import { DataProvider } from "@/lib/db/provider";

/** Full-screen pages (live workout, cardio, welcome): no tab bar. */
export default function FocusLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <DataProvider>{children}</DataProvider>
    </div>
  );
}
