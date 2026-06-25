import { Link, useLocation } from "wouter";
import { LayoutDashboard, List, Inbox, LogOut } from "lucide-react";
import {
  useListTransactions,
  getListTransactionsQueryKey,
  useResetUser,
  getGetUserProfileQueryKey,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const queryClient = useQueryClient();

  const { data: inboxTransactions } = useListTransactions(
    { uncategorizedOnly: true },
    { query: { queryKey: getListTransactionsQueryKey({ uncategorizedOnly: true }) } }
  );

  const inboxCount = inboxTransactions?.length || 0;

  const resetMutation = useResetUser({
    mutation: {
      onSuccess: async () => {
        // Wipe all cached data so the app re-fetches from scratch
        await queryClient.invalidateQueries();
        // Re-fetch profile — it will now return isOnboarded: false,
        // which drops the user back onto the onboarding wizard
        await queryClient.refetchQueries({ queryKey: getGetUserProfileQueryKey() });
      },
    },
  });

  const handleReset = () => {
    if (resetMutation.isPending) return;
    resetMutation.mutate();
  };

  const navItems = [
    { href: "/", label: "Home", icon: LayoutDashboard },
    { href: "/transactions", label: "Transactions", icon: List },
    { href: "/inbox", label: "Inbox", icon: Inbox, badge: inboxCount > 0 ? inboxCount : null },
  ];

  return (
    <div className="flex min-h-[100dvh] w-full bg-background flex-col md:flex-row">
      {/* Mobile nav (bottom) */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-border bg-card/80 backdrop-blur-md md:hidden">
        {navItems.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="flex h-full flex-1 flex-col items-center justify-center gap-1 relative">
              <div className={cn(
                "flex items-center justify-center rounded-full p-1.5 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}>
                <Icon className="h-5 w-5" />
                {item.badge && (
                  <span className="absolute top-2 right-1/4 -mt-1 -mr-2 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className={cn(
                "text-[10px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Desktop nav (sidebar) */}
      <nav className="hidden md:flex w-64 flex-col border-r border-border bg-card p-6">
        <div className="flex items-center gap-2 px-2 mb-8">
          <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-display font-bold text-lg">
            C
          </div>
          <span className="font-display font-semibold text-lg tracking-tight">Conscious</span>
        </div>

        <div className="flex flex-col gap-2">
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors relative",
                isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              )}>
                <Icon className="h-5 w-5" />
                {item.label}
                {item.badge && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Reset / Switch Mode — testing utility, prominently placed */}
        <div className="mt-auto pt-6 border-t border-border">
          <button
            onClick={handleReset}
            disabled={resetMutation.isPending}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
              resetMutation.isPending && "opacity-50 cursor-not-allowed"
            )}
          >
            <LogOut className="h-5 w-5" />
            {resetMutation.isPending ? "Resetting…" : "Logout / Switch Mode"}
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 pb-16 md:pb-0 overflow-y-auto">
        <div className="mx-auto max-w-2xl p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
