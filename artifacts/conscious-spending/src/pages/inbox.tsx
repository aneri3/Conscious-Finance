import { useState } from "react";
import {
  useListTransactions,
  getListTransactionsQueryKey,
  useListCategories,
  getListCategoriesQueryKey,
  tagTransactionCategory,
  type Transaction,
} from "@workspace/api-client-react";
import { formatRupee, cleanNarration, cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";

// ---- Display item types ----

interface SingleItem {
  type: "single";
  txn: Transaction;
}

interface ClusterItem {
  type: "cluster";
  clusterId: string;
  txns: Transaction[];
  totalAmount: number;
  timeRange: string;
}

type InboxItem = SingleItem | ClusterItem;

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function buildClusterTimeRange(txns: Transaction[]): string {
  if (txns.length < 2) return formatTime(txns[0].txnTimestamp);
  const sorted = [...txns].sort(
    (a, b) => new Date(a.txnTimestamp).getTime() - new Date(b.txnTimestamp).getTime()
  );
  return `${formatTime(sorted[0].txnTimestamp)}–${formatTime(sorted[sorted.length - 1].txnTimestamp)}`;
}

function groupIntoItems(transactions: Transaction[]): InboxItem[] {
  const clusterMap = new Map<string, Transaction[]>();
  const singles: Transaction[] = [];

  for (const txn of transactions) {
    if (txn.clusterId) {
      const group = clusterMap.get(txn.clusterId) ?? [];
      group.push(txn);
      clusterMap.set(txn.clusterId, group);
    } else {
      singles.push(txn);
    }
  }

  const items: InboxItem[] = [];

  // Add cluster items (maintain chronological order using earliest txn timestamp)
  for (const [clusterId, txns] of clusterMap.entries()) {
    const totalAmount = txns.reduce((sum, t) => sum + t.amount, 0);
    items.push({
      type: "cluster",
      clusterId,
      txns,
      totalAmount,
      timeRange: buildClusterTimeRange(txns),
    });
  }

  // Add singles
  for (const txn of singles) {
    items.push({ type: "single", txn });
  }

  // Sort all items by most recent timestamp (clusters use their earliest member)
  items.sort((a, b) => {
    const tsA =
      a.type === "single"
        ? new Date(a.txn.txnTimestamp).getTime()
        : Math.max(...a.txns.map((t) => new Date(t.txnTimestamp).getTime()));
    const tsB =
      b.type === "single"
        ? new Date(b.txn.txnTimestamp).getTime()
        : Math.max(...b.txns.map((t) => new Date(t.txnTimestamp).getTime()));
    return tsB - tsA;
  });

  return items;
}

export default function Inbox() {
  const queryClient = useQueryClient();
  // Track which item IDs are currently being tagged (single txn id or cluster id)
  const [taggingKey, setTaggingKey] = useState<string | null>(null);

  const { data: transactions, isLoading: txnsLoading } = useListTransactions(
    { uncategorizedOnly: true },
    { query: { queryKey: getListTransactionsQueryKey({ uncategorizedOnly: true }) } }
  );

  const { data: categories } = useListCategories(
    { query: { queryKey: getListCategoriesQueryKey() } }
  );

  const displayCategories = categories?.filter((c) => c.code !== "UNCATEGORIZED") ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey({ uncategorizedOnly: true }) });
  };

  /** Tag a single transaction */
  const handleTagSingle = async (txnId: number, categoryCode: string) => {
    const key = String(txnId);
    if (taggingKey) return;
    setTaggingKey(key);
    try {
      await tagTransactionCategory(txnId, { categoryCode });
      invalidate();
    } finally {
      setTaggingKey(null);
    }
  };

  /** Tag all transactions in a cluster at once */
  const handleTagCluster = async (clusterId: string, txns: Transaction[], categoryCode: string) => {
    if (taggingKey) return;
    setTaggingKey(clusterId);
    try {
      await Promise.all(txns.map((t) => tagTransactionCategory(t.id, { categoryCode })));
      invalidate();
    } finally {
      setTaggingKey(null);
    }
  };

  if (txnsLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <h1 className="text-2xl font-display font-semibold tracking-tight">Inbox</h1>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center animate-in fade-in zoom-in-95 duration-500">
        <div className="h-20 w-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-2">
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <h2 className="text-2xl font-display font-semibold">Inbox zero</h2>
        <p className="text-muted-foreground text-sm max-w-xs">
          All your transactions are categorized. You're completely up to date.
        </p>
      </div>
    );
  }

  const items = groupIntoItems(transactions);
  const totalCount = transactions.length;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-semibold tracking-tight">Inbox</h1>
        <div className="px-2.5 py-1 rounded-full bg-secondary text-xs font-medium">
          {totalCount} to review
        </div>
      </div>

      <div className="space-y-4">
        {items.map((item) => {
          if (item.type === "cluster") {
            return (
              <ClusterCard
                key={item.clusterId}
                item={item}
                displayCategories={displayCategories}
                isTagging={taggingKey === item.clusterId}
                onTag={(code) => handleTagCluster(item.clusterId, item.txns, code)}
              />
            );
          }

          const txn = item.txn;
          const key = String(txn.id);
          const isTagging = taggingKey === key;
          const meta = txn.metadata ?? {};
          const isWeekendSwap = (meta as { isLikelyWeekendCashSwap?: boolean }).isLikelyWeekendCashSwap === true;
          const isServiceSuggestion = (meta as { isRecurringServiceSuggestion?: boolean }).isRecurringServiceSuggestion === true;
          const suggestedCode = (meta as { suggestedCategoryOnDateHeuristic?: string }).suggestedCategoryOnDateHeuristic;

          return (
            <div
              key={txn.id}
              className={cn(
                "bg-card border rounded-3xl p-5 shadow-sm transition-all duration-300",
                isWeekendSwap && "border-amber-400/60 ring-1 ring-amber-400/30",
                isTagging
                  ? "opacity-0 scale-95 origin-center pointer-events-none h-0 p-0 m-0 overflow-hidden border-transparent"
                  : "opacity-100 scale-100"
              )}
            >
              {/* Weekend cash swap flag */}
              {isWeekendSwap && (
                <div className="flex items-center gap-1.5 text-amber-600 text-xs font-medium mb-3">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Likely weekend cash swap
                </div>
              )}

              <div className="flex justify-between items-start mb-4">
                <div className="flex flex-col pr-4">
                  <span className="font-medium text-base leading-tight line-clamp-2">
                    {cleanNarration(txn.rawNarration)}
                  </span>
                  <span className="text-xs text-muted-foreground mt-1">
                    {new Date(txn.txnTimestamp).toLocaleDateString("en-IN", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <span className="font-semibold text-lg whitespace-nowrap">
                  {formatRupee(txn.amount)}
                </span>
              </div>

              {/* Heuristic #1 hint: recurring service suggestion */}
              {isServiceSuggestion && (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-xl px-3 py-2 mb-3">
                  Presumed monthly service / staff payment based on date — tap to confirm or choose another.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {displayCategories.map((cat) => {
                  const isSuggestedHint = isServiceSuggestion && cat.code === suggestedCode;
                  return (
                    <button
                      key={cat.code}
                      onClick={() => handleTagSingle(txn.id, cat.code)}
                      className={cn(
                        "px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95",
                        isSuggestedHint
                          ? "bg-primary/15 text-primary border border-primary/40 hover:bg-primary/25"
                          : "bg-secondary/50 hover:bg-secondary text-foreground border border-transparent hover:border-border/50"
                      )}
                    >
                      {cat.displayName}
                      {isSuggestedHint && <span className="ml-1 opacity-60">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Cluster Card ----

interface ClusterCardProps {
  item: ClusterItem;
  displayCategories: Array<{ code: string; displayName: string }>;
  isTagging: boolean;
  onTag: (categoryCode: string) => void;
}

function ClusterCard({ item, displayCategories, isTagging, onTag }: ClusterCardProps) {
  return (
    <div
      className={cn(
        "bg-card border rounded-3xl p-5 shadow-sm transition-all duration-300",
        "border-dashed border-muted-foreground/30",
        isTagging
          ? "opacity-0 scale-95 origin-center pointer-events-none h-0 p-0 m-0 overflow-hidden border-transparent"
          : "opacity-100 scale-100"
      )}
    >
      {/* Cluster header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-secondary text-xs font-medium text-muted-foreground">
          <Clock className="h-3 w-3" />
          {item.timeRange}
        </div>
        <span className="px-2 py-0.5 rounded-full bg-secondary text-xs font-medium text-muted-foreground">
          {item.txns.length} small payments
        </span>
      </div>

      {/* Stacked visual for cluster members */}
      <div className="mb-4 space-y-1.5">
        {item.txns.slice(0, 3).map((t, i) => (
          <div
            key={t.id}
            className={cn(
              "flex justify-between items-center text-sm",
              i > 0 && "text-muted-foreground"
            )}
          >
            <span className="truncate pr-2 max-w-[70%]">{cleanNarration(t.rawNarration)}</span>
            <span className="whitespace-nowrap text-xs">{formatRupee(t.amount)}</span>
          </div>
        ))}
        {item.txns.length > 3 && (
          <p className="text-xs text-muted-foreground">
            +{item.txns.length - 3} more
          </p>
        )}
      </div>

      {/* Total */}
      <div className="flex justify-between items-center mb-4 pt-2 border-t border-border/50">
        <span className="text-xs text-muted-foreground font-medium">Total</span>
        <span className="font-semibold">{formatRupee(item.totalAmount)}</span>
      </div>

      {/* Category buttons — one tap tags all members */}
      <div className="flex flex-wrap gap-2">
        {displayCategories.map((cat) => (
          <button
            key={cat.code}
            onClick={() => onTag(cat.code)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95",
              "bg-secondary/50 hover:bg-secondary text-foreground",
              "border border-transparent hover:border-border/50"
            )}
          >
            {cat.displayName}
          </button>
        ))}
      </div>
    </div>
  );
}
