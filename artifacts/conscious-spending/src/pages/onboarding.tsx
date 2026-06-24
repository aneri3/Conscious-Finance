import { useState } from "react";
import { useSetupUser, getGetUserProfileQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { IndianRupee, Database, Upload, ChevronRight, Wallet } from "lucide-react";

interface OnboardingProps {
  onComplete: () => void;
}

type DataSourceMode = "AA_MOCK" | "CSV_UPLOAD";

export default function Onboarding({ onComplete }: OnboardingProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [safeLimitPct, setSafeLimitPct] = useState(40);
  const [dataSourceMode, setDataSourceMode] = useState<DataSourceMode | null>(null);
  const [incomeError, setIncomeError] = useState("");

  const setupMutation = useSetupUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetUserProfileQueryKey() });
        onComplete();
      },
    },
  });

  const parsedIncome = parseFloat(monthlyIncome.replace(/[^0-9.]/g, ""));

  function handleIncomeNext() {
    if (!parsedIncome || parsedIncome <= 0) {
      setIncomeError("Please enter a valid monthly income");
      return;
    }
    setIncomeError("");
    setStep(2);
  }

  function handleSourceSelect(mode: DataSourceMode) {
    setDataSourceMode(mode);
    setStep(3);
  }

  function handleSubmit() {
    if (!dataSourceMode || !parsedIncome) return;
    setupMutation.mutate({
      data: {
        monthlyIncome: parsedIncome,
        safeLimitPct,
        dataSourceMode,
      },
    });
  }

  const safeAmount = parsedIncome ? Math.round((parsedIncome * safeLimitPct) / 100) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
      <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-6 duration-500">

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                s <= step ? "w-8 bg-primary" : "w-4 bg-muted"
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 mb-1">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Wallet className="h-5 w-5 text-primary" />
                </div>
                <h1 className="text-2xl font-display font-semibold tracking-tight">Welcome to Conscious</h1>
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed">
                We'll calculate your Safe Limit — the amount you can spend guilt-free each month. What's your monthly take-home salary?
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">Monthly income</label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="80,000"
                  value={monthlyIncome}
                  onChange={(e) => {
                    setMonthlyIncome(e.target.value);
                    if (incomeError) setIncomeError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleIncomeNext()}
                  className="w-full rounded-xl border border-input bg-background pl-9 pr-4 py-3 text-base font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>
              {incomeError && <p className="text-xs text-destructive">{incomeError}</p>}
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Safe Limit</label>
                <span className="text-sm font-bold tabular-nums">
                  {safeLimitPct}%
                  {safeAmount && (
                    <span className="text-muted-foreground font-normal ml-1">
                      (₹{safeAmount.toLocaleString("en-IN")}/mo)
                    </span>
                  )}
                </span>
              </div>
              <input
                type="range"
                min={20}
                max={60}
                step={1}
                value={safeLimitPct}
                onChange={(e) => setSafeLimitPct(parseInt(e.target.value, 10))}
                className="w-full accent-primary cursor-pointer"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>20% conservative</span>
                <span className="text-primary font-medium">35–45% ideal</span>
                <span>60% generous</span>
              </div>
            </div>

            <Button className="w-full rounded-xl h-11" onClick={handleIncomeNext}>
              Continue <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-display font-semibold tracking-tight">How do you want to add transactions?</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                You can use our realistic sample data to explore the app, or upload your own bank statement CSV.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleSourceSelect("AA_MOCK")}
                className="flex items-start gap-4 rounded-2xl border-2 border-border bg-card p-5 text-left transition-all hover:border-primary/40 hover:bg-primary/5 group"
              >
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                  <Database className="h-5 w-5 text-primary" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-foreground">Use sample data</span>
                  <span className="text-sm text-muted-foreground leading-relaxed">
                    60 realistic Indian transactions — Swiggy, Zomato, UPI transfers, salary, rent. Great for exploring before connecting real data.
                  </span>
                </div>
              </button>

              <button
                onClick={() => handleSourceSelect("CSV_UPLOAD")}
                className="flex items-start gap-4 rounded-2xl border-2 border-border bg-card p-5 text-left transition-all hover:border-primary/40 hover:bg-primary/5 group"
              >
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/15 transition-colors">
                  <Upload className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-foreground">Upload my bank statement</span>
                  <span className="text-sm text-muted-foreground leading-relaxed">
                    Upload a CSV export from HDFC, ICICI, SBI, Axis, or any UPI-connected account. Your data stays local.
                  </span>
                </div>
              </button>
            </div>

            <button
              onClick={() => setStep(1)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
            >
              ← Back
            </button>
          </div>
        )}

        {step === 3 && dataSourceMode && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-display font-semibold tracking-tight">You're all set</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Here's your spending plan. You can always change these in Settings later.
              </p>
            </div>

            <div className="rounded-2xl bg-card border p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Monthly income</span>
                <span className="font-semibold">₹{parsedIncome.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Safe Limit</span>
                <span className="font-semibold">{safeLimitPct}% · ₹{safeAmount?.toLocaleString("en-IN")}/mo</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Data source</span>
                <span className="font-semibold">
                  {dataSourceMode === "AA_MOCK" ? "Sample data" : "CSV upload"}
                </span>
              </div>
            </div>

            <Button
              className="w-full rounded-xl h-11"
              onClick={handleSubmit}
              disabled={setupMutation.isPending}
            >
              {setupMutation.isPending ? "Setting up…" : "Open my dashboard →"}
            </Button>

            {setupMutation.isError && (
              <p className="text-xs text-destructive text-center">
                Something went wrong. Please try again.
              </p>
            )}

            <button
              onClick={() => setStep(2)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
