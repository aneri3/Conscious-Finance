import { formatFriendlyDate, formatRupee, getCategoryColor, cleanNarration } from "@/lib/utils";
import type { Transaction } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface TransactionRowProps {
  transaction: Transaction;
  onClick?: () => void;
}

export function TransactionRow({ transaction, onClick }: TransactionRowProps) {
  const isDebit = transaction.txnType === "DEBIT";
  const amountPrefix = isDebit ? "-" : "+";
  const amountColor = isDebit ? "text-foreground" : "text-emerald-600 dark:text-emerald-400";
  
  const categoryCode = transaction.categoryCode || "UNCATEGORIZED";
  const categoryLabel = transaction.categoryDisplayName || "Uncategorized";
  
  return (
    <div 
      className={cn(
        "flex items-center justify-between py-3 group",
        onClick && "cursor-pointer hover:bg-secondary/30 -mx-2 px-2 rounded-lg transition-colors"
      )}
      onClick={onClick}
    >
      <div className="flex flex-col gap-1 overflow-hidden pr-4">
        <span className="truncate font-medium text-sm">
          {cleanNarration(transaction.rawNarration)}
        </span>
        <div className="flex items-center gap-2 text-xs">
          <span className={cn("px-1.5 py-0.5 rounded-md font-medium text-[10px]", getCategoryColor(categoryCode))}>
            {categoryLabel}
          </span>
          {transaction.isP2p && (
            <span className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-1.5 py-0.5 rounded-md font-medium text-[10px]">
              P2P
            </span>
          )}
        </div>
      </div>
      
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className={cn("font-medium text-sm whitespace-nowrap", amountColor)}>
          {amountPrefix}{formatRupee(transaction.amount)}
        </span>
      </div>
    </div>
  );
}