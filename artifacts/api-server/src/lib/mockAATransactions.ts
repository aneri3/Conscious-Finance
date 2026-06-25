/**
 * PLACEHOLDER: Mock Account Aggregator / TSP Integration
 *
 * This module simulates the data layer that would be provided by a real
 * Account Aggregator TSP (Setu, FinBox, OneMoney, Anumati, etc.) via
 * India's Account Aggregator framework (RBI-regulated).
 *
 * To replace with a real integration:
 *   1. Implement a new module that satisfies the same RawAATransaction interface
 *   2. Replace the fetchAATransactions export with a real API call to your chosen TSP
 *   3. No other files need to change — the categorization engine consumes this interface
 */

export interface RawAATransaction {
  bankTxnRef: string;
  amount: number;
  txnType: "DEBIT" | "CREDIT";
  txnTimestamp: Date;
  rawNarration: string;
  counterpartyVpa: string | null;
  mccCode: string | null;
  /** Payment rail — "UNKNOWN" for CSV-sourced rows that don't carry mode info */
  mode?: "UPI" | "NEFT" | "IMPS" | "CARD" | "UNKNOWN";
  /** Where this transaction was ingested from — for traceability only, never branch categorization on this */
  ingestionSource?: "AA_MOCK" | "CSV_UPLOAD";
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Date N days ago at a random hour */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(randomBetween(8, 22), randomBetween(0, 59), randomBetween(0, 59), 0);
  return d;
}

/** Fixed timestamp on a specific day of the CURRENT month at a precise time — needed for heuristic demos */
function thisMonthAt(day: number, hour: number, minute: number): Date {
  const d = new Date();
  d.setDate(day);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Most recent Saturday at a given hour (for heuristic #4 weekend demo) */
function lastSaturdayAt(hour: number, minute: number): Date {
  const d = new Date();
  const daysToLastSat = (d.getDay() + 1) % 7; // days since Saturday
  d.setDate(d.getDate() - (daysToLastSat === 0 ? 7 : daysToLastSat));
  d.setHours(hour, minute, 0, 0);
  return d;
}

const CURRENT_MONTH_TRANSACTIONS: RawAATransaction[] = [
  // ---- Rule-matched: Swiggy (EXACT_VPA → FOOD_GROCERIES) ----
  {
    bankTxnRef: "MOCK-TXN-001",
    amount: 349,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(1),
    rawNarration: "UPI/swiggy@axisbank/Swiggy Food/SWIGGY",
    counterpartyVpa: "swiggy@axisbank",
    mccCode: "5812",
  },
  {
    bankTxnRef: "MOCK-TXN-002",
    amount: 218,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(2),
    rawNarration: "UPI/swiggy@axisbank/Swiggy Food/SWIGGY",
    counterpartyVpa: "swiggy@axisbank",
    mccCode: "5812",
  },
  {
    bankTxnRef: "MOCK-TXN-003",
    amount: 529,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(4),
    rawNarration: "UPI/swiggy@axisbank/Swiggy Instamart/SWIGGY",
    counterpartyVpa: "swiggy@axisbank",
    mccCode: "5411",
  },

  // ---- Rule-matched: Zomato (EXACT_VPA → FOOD_GROCERIES) ----
  {
    bankTxnRef: "MOCK-TXN-004",
    amount: 412,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(1),
    rawNarration: "UPI/zomato@icici/Zomato Order/ZOMATO",
    counterpartyVpa: "zomato@icici",
    mccCode: "5812",
  },
  {
    bankTxnRef: "MOCK-TXN-005",
    amount: 285,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(3),
    rawNarration: "UPI/zomato@icici/Zomato Order/ZOMATO",
    counterpartyVpa: "zomato@icici",
    mccCode: "5812",
  },
  {
    bankTxnRef: "MOCK-TXN-006",
    amount: 198,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(7),
    rawNarration: "UPI/zomato@icici/Zomato Order/ZOMATO",
    counterpartyVpa: "zomato@icici",
    mccCode: "5812",
  },

  // ---- Rule-matched: Rapido (EXACT_VPA → TRAVEL_COMMUTE) ----
  {
    bankTxnRef: "MOCK-TXN-007",
    amount: 65,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(1),
    rawNarration: "UPI/rapido@paytm/Rapido Ride/RAPIDO",
    counterpartyVpa: "rapido@paytm",
    mccCode: "4121",
  },
  {
    bankTxnRef: "MOCK-TXN-008",
    amount: 89,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(3),
    rawNarration: "UPI/rapido@paytm/Rapido Ride/RAPIDO",
    counterpartyVpa: "rapido@paytm",
    mccCode: "4121",
  },
  {
    bankTxnRef: "MOCK-TXN-009",
    amount: 72,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(5),
    rawNarration: "UPI/rapido@paytm/Rapido Ride/RAPIDO",
    counterpartyVpa: "rapido@paytm",
    mccCode: "4121",
  },

  // ---- Rule-matched: REGEX electricity/broadband/rent → RENT_BILLS ----
  {
    bankTxnRef: "MOCK-TXN-010",
    amount: 12000,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(15),
    rawNarration: "NEFT/HDFC0001234/House Rent Payment/rent",
    counterpartyVpa: null,
    mccCode: null,
  },
  {
    bankTxnRef: "MOCK-TXN-011",
    amount: 1199,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(10),
    rawNarration: "ACH/AIRTEL/broadband monthly plan/AIRTEL",
    counterpartyVpa: null,
    mccCode: null,
  },
  {
    bankTxnRef: "MOCK-TXN-012",
    amount: 2200,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(12),
    rawNarration: "NACH/BSES/electricity bill payment/BSES",
    counterpartyVpa: null,
    mccCode: null,
  },

  // ---- LLM fallback variety ----
  {
    bankTxnRef: "MOCK-TXN-013",
    amount: 1899,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(2),
    rawNarration: "UPI/myntra.bd@hdfcbank/Myntra Purchase/MYNTRA",
    counterpartyVpa: "myntra.bd@hdfcbank",
    mccCode: "5691",
  },
  {
    bankTxnRef: "MOCK-TXN-014",
    amount: 3299,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(9),
    rawNarration: "UPI/myntra.bd@hdfcbank/Myntra Purchase/MYNTRA",
    counterpartyVpa: "myntra.bd@hdfcbank",
    mccCode: "5691",
  },
  {
    bankTxnRef: "MOCK-TXN-015",
    amount: 880,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(6),
    rawNarration: "UPI/bookmyshow@icicibank/BookMyShow Tickets/BMS",
    counterpartyVpa: "bookmyshow@icicibank",
    mccCode: "7832",
  },
  {
    bankTxnRef: "MOCK-TXN-016",
    amount: 2150,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(5),
    rawNarration: "UPI/bigbasket@axis/BigBasket Groceries/BBT",
    counterpartyVpa: "bigbasket@axis",
    mccCode: "5411",
  },
  {
    bankTxnRef: "MOCK-TXN-017",
    amount: 1680,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(13),
    rawNarration: "UPI/bigbasket@axis/BigBasket Groceries/BBT",
    counterpartyVpa: "bigbasket@axis",
    mccCode: "5411",
  },
  {
    bankTxnRef: "MOCK-TXN-018",
    amount: 234,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(2),
    rawNarration: "UPI/uber@paytm/Uber Technologies/UBER",
    counterpartyVpa: "uber@paytm",
    mccCode: "4121",
  },
  {
    bankTxnRef: "MOCK-TXN-019",
    amount: 312,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(4),
    rawNarration: "UPI/uber@paytm/Uber Technologies/UBER",
    counterpartyVpa: "uber@paytm",
    mccCode: "4121",
  },
  {
    bankTxnRef: "MOCK-TXN-020",
    amount: 599,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(3),
    rawNarration: "UPI/nykaa@razorpay/Nykaa Beauty/NYKAA",
    counterpartyVpa: "nykaa@razorpay",
    mccCode: "5977",
  },
  {
    bankTxnRef: "MOCK-TXN-021",
    amount: 4499,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(11),
    rawNarration: "UPI/amazon@apl/Amazon Purchase/AMAZON",
    counterpartyVpa: "amazon@apl",
    mccCode: "5999",
  },
  {
    bankTxnRef: "MOCK-TXN-022",
    amount: 1299,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(8),
    rawNarration: "UPI/flipkart@razorpay/Flipkart Order/FLIPKART",
    counterpartyVpa: "flipkart@razorpay",
    mccCode: "5999",
  },
  {
    bankTxnRef: "MOCK-TXN-023",
    amount: 799,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(6),
    rawNarration: "UPI/hotstar@razorpay/Disney Hotstar/HOTSTAR",
    counterpartyVpa: "hotstar@razorpay",
    mccCode: "7994",
  },
  {
    bankTxnRef: "MOCK-TXN-024",
    amount: 1200,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(14),
    rawNarration: "UPI/cure.fit@icici/Cure.fit Gym/CUREFIT",
    counterpartyVpa: "cure.fit@icici",
    mccCode: "7941",
  },
  {
    bankTxnRef: "MOCK-TXN-025",
    amount: 2499,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(11),
    rawNarration: "UPI/ajio@razorpay/AJIO Fashion/AJIO",
    counterpartyVpa: "ajio@razorpay",
    mccCode: "5691",
  },
  {
    bankTxnRef: "MOCK-TXN-026",
    amount: 4999,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(10),
    rawNarration: "UPI/croma@hdfcbank/Croma Electronics/CROMA",
    counterpartyVpa: "croma@hdfcbank",
    mccCode: "5732",
  },
  {
    bankTxnRef: "MOCK-TXN-027",
    amount: 850,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(16),
    rawNarration: "UPI/inox@razorpay/INOX Movies/INOX",
    counterpartyVpa: "inox@razorpay",
    mccCode: "7832",
  },
  {
    bankTxnRef: "MOCK-TXN-028",
    amount: 3200,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(6),
    rawNarration: "UPI/makemytrip@icici/MakeMyTrip Booking/MMT",
    counterpartyVpa: "makemytrip@icici",
    mccCode: "4722",
  },

  // ---- CREDIT (salary, refunds — excluded from Safe Limit) ----
  {
    bankTxnRef: "MOCK-TXN-029",
    amount: 80000,
    txnType: "CREDIT",
    txnTimestamp: daysAgo(15),
    rawNarration: "NEFT/TECHCORP/Salary June 2026/TECHCORP SOLUTIONS",
    counterpartyVpa: null,
    mccCode: null,
  },
  {
    bankTxnRef: "MOCK-TXN-030",
    amount: 1899,
    txnType: "CREDIT",
    txnTimestamp: daysAgo(8),
    rawNarration: "UPI/myntra.bd@hdfcbank/Myntra Refund/MYNTRA",
    counterpartyVpa: "myntra.bd@hdfcbank",
    mccCode: null,
  },

  // ---- Regular P2P (structural detection → P2P_UNCATEGORIZED) ----
  {
    bankTxnRef: "MOCK-TXN-031",
    amount: 500,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(4),
    rawNarration: "UPI/8765432109/Priya Sharma/dinner split",
    counterpartyVpa: "priya.sharma99@paytm",
    mccCode: null,
  },
  {
    bankTxnRef: "MOCK-TXN-032",
    amount: 800,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(13),
    rawNarration: "UPI/8899001122/Vikram Singh/grocery split",
    counterpartyVpa: "8899001122@ybl",
    mccCode: null,
  },

  // ============================================================
  // HEURISTIC DEMO TRANSACTIONS
  // ============================================================

  // ---- Heuristic #1: Staff/Services (early-month large P2P → RENT_BILLS suggestion) ----
  // Day 2 of this month, ₹3000 — triggers calendar-anchor hint (isRecurringServiceSuggestion)
  // but does NOT auto-apply RENT_BILLS. User must confirm in inbox.
  {
    bankTxnRef: "MOCK-TXN-H1-MAID",
    amount: 3000,
    txnType: "DEBIT",
    txnTimestamp: thisMonthAt(2, 9, 15),
    rawNarration: "UPI/9123456780/Savitri Devi/maid payment",
    counterpartyVpa: "9123456780@ybl",
    mccCode: null,
  },

  // ---- Heuristic #2: Odd-amount auto fare (auto-categorize → TRAVEL_COMMUTE) ----
  // Amount ₹83 — P2P DEBIT, non-round, < ₹300. Auto-tagged as TRAVEL_COMMUTE.
  {
    bankTxnRef: "MOCK-TXN-H2-AUTO1",
    amount: 83,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(3),
    rawNarration: "UPI/9876543210/Ramesh Auto/auto fare",
    counterpartyVpa: "9876543210@ybl",
    mccCode: null,
  },
  // Amount ₹127 — same pattern, different ride
  {
    bankTxnRef: "MOCK-TXN-H2-AUTO2",
    amount: 127,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(6),
    rawNarration: "UPI/9988112233/Suresh Kumar/auto fare office",
    counterpartyVpa: "9988112233@ybl",
    mccCode: null,
  },

  // ---- Heuristic #3: Velocity cluster ("Chai-Tapri" outing) ----
  // Three micro-debits < ₹100 within 90 minutes of each other → clustered
  // Fixed times: 4:00 PM, 4:28 PM, 5:03 PM — all within 90 min of anchor (4:00 PM)
  {
    bankTxnRef: "MOCK-TXN-H3-CHAI1",
    amount: 50, // round — does NOT trigger heuristic #2, stays P2P_UNCATEGORIZED for clustering
    txnType: "DEBIT",
    txnTimestamp: thisMonthAt(22, 16, 0),
    rawNarration: "UPI/7700112233/Sharma Tea Stall/chai",
    counterpartyVpa: "7700112233@paytm",
    mccCode: null,
  },
  {
    bankTxnRef: "MOCK-TXN-H3-CHAI2",
    amount: 60, // round — does NOT trigger heuristic #2, stays P2P_UNCATEGORIZED for clustering
    txnType: "DEBIT",
    txnTimestamp: thisMonthAt(22, 16, 28),
    rawNarration: "UPI/8811223344/Raju Snacks/vada pav",
    counterpartyVpa: "8811223344@ybl",
    mccCode: null,
  },
  {
    bankTxnRef: "MOCK-TXN-H3-CHAI3",
    amount: 40, // round — does NOT trigger heuristic #2, stays P2P_UNCATEGORIZED for clustering
    txnType: "DEBIT",
    txnTimestamp: thisMonthAt(22, 17, 3),
    rawNarration: "UPI/9922334455/Ganesh Paan/paan",
    counterpartyVpa: "9922334455@ybl",
    mccCode: null,
  },

  // ---- Heuristic #4: Weekend round-number (UI flag only — isLikelyWeekendCashSwap) ----
  // Saturday, ₹2000 round number — flags as likely weekend cash swap in inbox
  {
    bankTxnRef: "MOCK-TXN-H4-WKND",
    amount: 2000,
    txnType: "DEBIT",
    txnTimestamp: lastSaturdayAt(20, 30),
    rawNarration: "UPI/9876000001/Rahul Mehta/cash",
    counterpartyVpa: "9876000001@ybl",
    mccCode: null,
  },
];

/**
 * Fetch mock Account Aggregator transactions for a given user.
 * In production, replace this with a real TSP API call.
 */
export async function fetchAATransactions(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _userId: number,
): Promise<RawAATransaction[]> {
  // Simulate a short async delay as if hitting a real TSP
  await new Promise((resolve) => setTimeout(resolve, 50));
  return CURRENT_MONTH_TRANSACTIONS;
}
