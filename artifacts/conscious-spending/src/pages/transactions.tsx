import { useListTransactions, getListTransactionsQueryKey } from "@workspace/api-client-react";
import { TransactionRow } from "@/components/TransactionRow";
import { formatFriendlyDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { Transaction } from "@workspace/api-client-react";

export default function Transactions() {
  const { data: transactions, isLoading } = useListTransactions(
    {}, 
    { query: { queryKey: getListTransactionsQueryKey({}) } }
  );

  // Group transactions by date
  const groupedTransactions = transactions?.reduce((groups, txn) => {
    const dateStr = new Date(txn.txnTimestamp).toDateString();
    if (!groups[dateStr]) {
      groups[dateStr] = [];
    }
    groups[dateStr].push(txn);
    return groups;
  }, {} as Record<string, Transaction[]>) || {};

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-display font-semibold tracking-tight">Transactions</h1>
        <p className="text-sm text-muted-foreground mt-1">All your recent activity.</p>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          {[1, 2].map(group => (
            <div key={group} className="space-y-3">
              <Skeleton className="h-4 w-24" />
              <div className="bg-card border rounded-2xl p-4 space-y-4">
                {[1, 2, 3].map(row => (
                  <div key={row} className="flex justify-between">
                    <Skeleton className="h-10 w-48" />
                    <Skeleton className="h-10 w-16" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : Object.keys(groupedTransactions).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No transactions found.
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedTransactions).map(([dateStr, txns]) => (
            <div key={dateStr} className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pl-1">
                {formatFriendlyDate(txns[0].txnTimestamp)}
              </h3>
              <div className="bg-card border rounded-2xl p-2 px-4 shadow-sm">
                {txns.map((txn, index) => (
                  <div key={txn.id}>
                    {index > 0 && <div className="h-[1px] w-full bg-border/50" />}
                    <TransactionRow transaction={txn} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}