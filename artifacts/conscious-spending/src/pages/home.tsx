import { useRef, useState } from "react";
import {
  useGetCategoryBreakdown,
  getGetCategoryBreakdownQueryKey,
  useSyncTransactions,
  getGetSafeLimitQueryKey,
  getListTransactionsQueryKey,
  useGetSafeLimit,
  useGetUserProfile,
  getGetUserProfileQueryKey,
} from "@workspace/api-client-react";
import { SafeLimitCard } from "@/components/SafeLimitCard";
import { formatRupee, getCategoryColor } from "@/lib/utils";
import { RefreshCw, ArrowRight, AlertCircle, Upload, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";

interface CsvUploadResult {
  totalRowsParsed: number;
  totalRowsIngested: number;
  duplicatesSkipped: number;
  errors: Array<{ rowIndex: number; reason: string }>;
}

export default function Home() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState<CsvUploadResult | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  const { data: breakdown, isLoading: breakdownLoading } = useGetCategoryBreakdown({
    query: { queryKey: getGetCategoryBreakdownQueryKey() },
  });
  const { data: status } = useGetSafeLimit({ query: { queryKey: getGetSafeLimitQueryKey() } });
  const { data: profile } = useGetUserProfile({ query: { queryKey: getGetUserProfileQueryKey() } });

  const syncMutation = useSyncTransactions({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSafeLimitQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetCategoryBreakdownQueryKey() });
      },
    },
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: getGetSafeLimitQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetCategoryBreakdownQueryKey() });
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvUploading(true);
    setCsvResult(null);
    setCsvError(null);

    const formData = new FormData();
    formData.append("statement", file);

    try {
      const response = await fetch("/api/upload-csv", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setCsvError(data.error ?? "Upload failed");
      } else {
        setCsvResult(data as CsvUploadResult);
        invalidateAll();
      }
    } catch {
      setCsvError("Network error — please try again");
    } finally {
      setCsvUploading(false);
      // Reset input so the same file can be re-uploaded
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const isAaMock = profile?.dataSourceMode === "AA_MOCK";
  const isCsvUpload = profile?.dataSourceMode === "CSV_UPLOAD";

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-semibold tracking-tight">Overview</h1>

        {/* AA Mock: Sync button */}
        {isAaMock && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full h-8 text-xs font-medium"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            <RefreshCw className={`h-3 w-3 mr-1.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncMutation.isPending ? "Syncing…" : "Sync"}
          </Button>
        )}

        {/* CSV Upload: File picker */}
        {isCsvUpload && (
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleCsvUpload}
              id="csv-upload-input"
            />
            <Button
              variant="outline"
              size="sm"
              className="rounded-full h-8 text-xs font-medium"
              onClick={() => fileInputRef.current?.click()}
              disabled={csvUploading}
            >
              <Upload className={`h-3 w-3 mr-1.5 ${csvUploading ? "animate-pulse" : ""}`} />
              {csvUploading ? "Uploading…" : "Upload statement"}
            </Button>
          </div>
        )}
      </div>

      {/* CSV upload result summary */}
      {csvResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3 text-sm text-emerald-800 animate-in fade-in duration-300">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
          <div>
            <span className="font-semibold">{csvResult.totalRowsIngested} transactions added</span>
            {csvResult.duplicatesSkipped > 0 && (
              <span className="text-emerald-600">, {csvResult.duplicatesSkipped} duplicates skipped</span>
            )}
            {csvResult.errors.length > 0 && (
              <span className="text-amber-600">, {csvResult.errors.length} rows had errors</span>
            )}
          </div>
        </div>
      )}

      {/* CSV upload error */}
      {csvError && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 flex items-start gap-3 text-sm text-destructive animate-in fade-in duration-300">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{csvError}</span>
        </div>
      )}

      <SafeLimitCard />

      {status?.isRedZone && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-2xl p-4 flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
            <p className="text-sm font-medium leading-relaxed">
              You've crossed your Safe Limit for this month — no judgment, just awareness. Here's where it went.
            </p>
          </div>
          <div className="pl-7">
            <Link href="/transactions" className="text-sm font-bold hover:underline transition-all">
              View transactions
            </Link>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Where it went</h2>
          <Link
            href="/transactions"
            className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors flex items-center"
          >
            All transactions <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </div>

        <div className="bg-card border rounded-2xl p-1 overflow-hidden shadow-sm">
          {breakdownLoading ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-16" />
                </div>
              ))}
            </div>
          ) : breakdown?.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {isCsvUpload
                ? "Upload a bank statement to see your spending breakdown."
                : "Hit Sync to load your transactions."}
            </div>
          ) : (
            <div className="flex flex-col">
              {breakdown?.map((cat) => (
                <div
                  key={cat.categoryCode}
                  className="flex items-center justify-between p-3 hover:bg-secondary/50 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${getCategoryColor(cat.categoryCode).split(" ")[0]}`}
                    />
                    <span className="font-medium text-sm">{cat.displayName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{cat.transactionCount} txns</span>
                    <span className="font-semibold text-sm">{formatRupee(cat.totalAmount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
