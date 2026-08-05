import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import "./platforms"; // seed the platform registry (incl. any private-board overlay)
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toaster } from "./components/Toaster";
import { describeError, toast } from "./lib/toast";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, refetchOnWindowFocus: true },
  },
  // One place that turns every mutation failure into a toast, so no write fails
  // silently and no onError has to be threaded through each of the ~13 hooks. A
  // hook's own onError — useJobEvents' optimistic rollback — still runs too.
  mutationCache: new MutationCache({
    onError: (err) => toast.error(describeError(err)),
  }),
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
);
