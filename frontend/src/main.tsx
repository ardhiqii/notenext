import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { ThemeProvider } from "./components/theme-provider.tsx";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen.ts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryclient = new QueryClient();

const router = createRouter({
  routeTree,
  context: {
    queryClient: queryclient,
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={queryclient}>
      <ThemeProvider
        attribute={"class"}
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  
);
