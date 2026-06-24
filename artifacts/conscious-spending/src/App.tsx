import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  useGetUserProfile,
  getGetUserProfileQueryKey,
  getGetSafeLimitQueryKey,
  getListTransactionsQueryKey,
  getGetCategoryBreakdownQueryKey,
} from "@workspace/api-client-react";

import Home from "@/pages/home";
import Transactions from "@/pages/transactions";
import Inbox from "@/pages/inbox";
import Onboarding from "@/pages/onboarding";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function Router() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useGetUserProfile({
    query: { queryKey: getGetUserProfileQueryKey() },
  });

  function handleOnboardingComplete() {
    // Invalidate everything so the dashboard loads fresh data
    queryClient.invalidateQueries({ queryKey: getGetUserProfileQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSafeLimitQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetCategoryBreakdownQueryKey() });
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <span className="font-display font-bold text-xl text-primary">C</span>
          </div>
          <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {!profile?.isOnboarded && (
        <Onboarding onComplete={handleOnboardingComplete} />
      )}
      <AppLayout>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/transactions" component={Transactions} />
          <Route path="/inbox" component={Inbox} />
          <Route component={NotFound} />
        </Switch>
      </AppLayout>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
