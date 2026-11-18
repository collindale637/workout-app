import { ViewTransition } from "react";
import { DataProvider } from "@/lib/db/provider";

/** Full-screen pages (live workout, cardio, welcome): no tab bar. */
export default function FocusLayout({ children }: { children: React.ReactNode }) {
  return (
    // ⌄ on the live workout (type "nav-down"): the whole screen slides down out of the way, revealing Today.
    <ViewTransition exit={{ "nav-down": "slide-down", default: "none" }} default="none">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <DataProvider>{children}</DataProvider>
      </div>
    </ViewTransition>
  );
}
