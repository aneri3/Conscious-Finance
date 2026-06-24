import type { RawAATransaction } from "../types/transaction";

/**
 * Known PSP/merchant-style VPA suffixes are not, by themselves, proof of a
 * business. But a handful of structural signals together are a strong
 * P2P indicator. This intentionally stays conservative — false positives
 * here just mean an extra quick-tag for the user, which is cheap. False
 * negatives mean a P2P transfer gets mis-fed into the LLM/rule funnel,
 * which risks a wrong category silently affecting the Safe Limit number.
 */

// Personal UPI handles are typically <phone-or-name>@<psp>, not a registered
// merchant string. We can't reliably tell a personal handle from a tiny local
// merchant's handle, which is exactly why P2P detection is heuristic, not exact.
const PERSONAL_HANDLE_PATTERN = /^[a-z0-9.]{2,25}@(ybl|paytm|apl|axl|ibl|okhdfcbank|okicici|oksbi|okaxis)$/i;

// Narrations for genuine merchant payments almost always carry the merchant
// name in some recognizable form. P2P narrations from most bank statement
// formats look like "UPI/<phone-or-name>/<ref>/..." with no business name.
const RAW_UPI_NARRATION_PATTERN = /^UPI[\/\-]\d{10}[\/\-]/i;

export interface P2PSignals {
  noMccCode: boolean;
  personalLookingVpa: boolean;
  rawPhoneNarration: boolean;
  smallRoundAmount: boolean; // weak signal, used only to nudge, never decisive alone
}

export function detectP2P(txn: RawAATransaction): { isP2P: boolean; signals: P2PSignals } {
  const signals: P2PSignals = {
    noMccCode: !txn.mccCode,
    personalLookingVpa: txn.counterpartyVpa
      ? PERSONAL_HANDLE_PATTERN.test(txn.counterpartyVpa)
      : false,
    rawPhoneNarration: RAW_UPI_NARRATION_PATTERN.test(txn.narration ?? ""),
    smallRoundAmount: txn.amount > 0 && txn.amount <= 2000 && txn.amount % 10 === 0,
  };

  // Require at least two corroborating structural signals before calling it
  // P2P. Any single signal alone (e.g. "no MCC") is too common among small
  // legitimate merchants to be decisive on its own.
  //
  // Note: we deliberately do NOT gate this on `txn.mode === "UPI"`. AA-sourced
  // transactions reliably set mode, but CSV-sourced transactions (see
  // csv-parser.ts) set mode to "UNKNOWN" since bank statement exports don't
  // reliably indicate the payment rail. Gating on mode would silently turn
  // off P2P detection for the entire CSV upload path — exactly the
  // transactions (local/personal transfers) this check exists to catch.
  // The narration-pattern and missing-MCC signals below still work fine
  // without knowing the rail for certain.
  const strongSignalCount = [
    signals.noMccCode,
    signals.personalLookingVpa,
    signals.rawPhoneNarration,
  ].filter(Boolean).length;

  const isP2P = strongSignalCount >= 2;

  return { isP2P, signals };
}
