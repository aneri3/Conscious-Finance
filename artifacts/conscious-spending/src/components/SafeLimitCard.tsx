import { useGetSafeLimit, getGetSafeLimitQueryKey } from "@workspace/api-client-react";
import { formatRupee, getSafeLimitColor } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function SafeLimitCard() {
  const { data: status, isLoading } = useGetSafeLimit({ query: { queryKey: getGetSafeLimitQueryKey() } });

  if (isLoading) {
    return <Skeleton className="h-[200px] w-full rounded-3xl" />;
  }

  if (!status) return null;

  const colorInfo = getSafeLimitColor(status.percentUsed);
  const remaining = status.remainingAmount;
  
  let statusText = "";
  if (status.percentUsed <= 87.5) {
    statusText = "Comfortably under your safe limit";
  } else if (status.percentUsed <= 112.5) {
    statusText = "Right around your safe limit — the safe zone";
  } else {
    statusText = "Red zone — over your safe limit this month";
  }

  return (
    <div 
      className="relative overflow-hidden rounded-3xl p-6 md:p-8 transition-colors duration-500 ease-out border"
      style={{ backgroundColor: colorInfo.bgRgba, borderColor: colorInfo.bgRgba }}
    >
      <div className="relative z-10 flex flex-col items-center justify-center text-center">
        <span className="text-sm font-medium text-foreground/70 mb-2">Safe Limit Remaining</span>
        <h2 className="font-display text-5xl md:text-6xl font-bold tracking-tight mb-8">
          {formatRupee(remaining)}
        </h2>

        {/* Progress Bar */}
        <div className="w-full max-w-sm mb-4">
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
            <div 
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{ 
                width: `${Math.min(status.percentUsed, 100)}%`,
                backgroundColor: colorInfo.rgb
              }}
            />
            {/* The tick at 100% of safe limit */}
            <div 
              className="absolute top-0 bottom-0 w-[2px] bg-foreground/30"
              style={{ left: `${Math.min((status.safeLimitAmount / (status.safeLimitAmount * 1.5)) * 100, 100)}%` }}
            />
          </div>
        </div>

        <p className="text-sm font-medium" style={{ color: colorInfo.rgb }}>
          {statusText}
        </p>
      </div>
    </div>
  );
}