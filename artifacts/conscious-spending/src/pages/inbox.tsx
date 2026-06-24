import { useState } from "react";
import { 
  useListTransactions, 
  getListTransactionsQueryKey,
  useListCategories,
  getListCategoriesQueryKey,
  useTagTransactionCategory
} from "@workspace/api-client-react";
import { formatRupee, cleanNarration, getCategoryColor, cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";

export default function Inbox() {
  const queryClient = useQueryClient();
  const [taggingId, setTaggingId] = useState<number | null>(null);

  const { data: transactions, isLoading: txnsLoading } = useListTransactions(
    { uncategorizedOnly: true },
    { query: { queryKey: getListTransactionsQueryKey({ uncategorizedOnly: true }) } }
  );

  const { data: categories } = useListCategories(
    { query: { queryKey: getListCategoriesQueryKey() } }
  );

  const tagMutation = useTagTransactionCategory({
    mutation: {
      onMutate: async ({ id }) => {
        setTaggingId(id);
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey({ uncategorizedOnly: true }) });
        setTaggingId(null);
      },
      onError: () => {
        setTaggingId(null);
      }
    }
  });

  const handleTag = (txnId: number, categoryCode: string) => {
    if (taggingId) return; // Prevent multiple clicks
    tagMutation.mutate({ id: txnId, data: { categoryCode } });
  };

  const displayCategories = categories?.filter(c => c.code !== "UNCATEGORIZED") || [];

  if (txnsLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <h1 className="text-2xl font-display font-semibold tracking-tight">Inbox</h1>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
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

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-semibold tracking-tight">Inbox</h1>
        <div className="px-2.5 py-1 rounded-full bg-secondary text-xs font-medium">
          {transactions.length} to review
        </div>
      </div>

      <div className="space-y-6">
        {transactions.map((txn) => (
          <div 
            key={txn.id} 
            className={cn(
              "bg-card border rounded-3xl p-5 shadow-sm transition-all duration-300",
              taggingId === txn.id ? "opacity-0 scale-95 origin-center pointer-events-none h-0 p-0 m-0 overflow-hidden border-transparent" : "opacity-100 scale-100"
            )}
          >
            <div className="flex justify-between items-start mb-6">
              <div className="flex flex-col pr-4">
                <span className="font-medium text-lg leading-tight line-clamp-2">
                  {cleanNarration(txn.rawNarration)}
                </span>
                <span className="text-xs text-muted-foreground mt-1">
                  {new Date(txn.txnTimestamp).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <span className="font-semibold text-lg whitespace-nowrap">
                {formatRupee(txn.amount)}
              </span>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {displayCategories.map((cat) => (
                <button
                  key={cat.code}
                  onClick={() => handleTag(txn.id, cat.code)}
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
        ))}
      </div>
    </div>
  );
}