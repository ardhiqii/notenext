import { Toaster } from "@/components/ui/sonner";
import ModalProvider from "@/providers/modal-provider";
import {
  createRootRoute,
  createRootRouteWithContext,
  Link,
  Outlet,
} from "@tanstack/react-router";
import { useHotkey } from "@tanstack/react-hotkeys";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import TabsBar from "@/components/tabs-bar";
import type { QueryClient } from "@tanstack/react-query";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: RootLayout,
  },
);

function RootLayout() {
  useHotkey("Mod+K", () => {
    console.log("### RUN ###");
  });
  useHotkey("Mod+Alt+N", () => {});
  useHotkey("Mod+Alt+W", () => {});
  return (
    <>
      <ModalProvider />
    <div className="h-screen flex flex-col ">
      <TabsBar />
      <div className="flex-1">
        <Outlet />
      </div>
      <Toaster position="top-center" />

      <TanStackRouterDevtools />
    </div>
    </>
  );
}
