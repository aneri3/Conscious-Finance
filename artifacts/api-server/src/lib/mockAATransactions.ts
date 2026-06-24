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

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(randomBetween(8, 22), randomBetween(0, 59), randomBetween(0, 59));
  return d;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function ref(prefix: string, n: number): string {
  return `${prefix}${pad(n)}${Date.now().toString().slice(-6)}`;
}

const CURRENT_MONTH_TRANSACTIONS: RawAATransaction[] = [
  // --- Rule-matched: Swiggy (EXACT_VPA → FOOD_GROCERIES) ---
  {
    bankTxnRef: ref("TXN", 1),
    amount: 349,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(1),
    rawNarration: "UPI/swiggy@axisbank/Swiggy Food/SWIGGY",
    counterpartyVpa: "swiggy@axisbank",
    mccCode: "5812",
  },
  {
    bankTxnRef: ref("TXN", 2),
    amount: 218,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(2),
    rawNarration: "UPI/swiggy@axisbank/Swiggy Food/SWIGGY",
    counterpartyVpa: "swiggy@axisbank",
    mccCode: "5812",
  },
  {
    bankTxnRef: ref("TXN", 3),
    amount: 529,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(4),
    rawNarration: "UPI/swiggy@axisbank/Swiggy Instamart/SWIGGY",
    counterpartyVpa: "swiggy@axisbank",
    mccCode: "5411",
  },

  // --- Rule-matched: Zomato (EXACT_VPA → FOOD_GROCERIES) ---
  {
    bankTxnRef: ref("TXN", 4),
    amount: 412,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(1),
    rawNarration: "UPI/zomato@icici/Zomato Order/ZOMATO",
    counterpartyVpa: "zomato@icici",
    mccCode: "5812",
  },
  {
    bankTxnRef: ref("TXN", 5),
    amount: 285,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(3),
    rawNarration: "UPI/zomato@icici/Zomato Order/ZOMATO",
    counterpartyVpa: "zomato@icici",
    mccCode: "5812",
  },
  {
    bankTxnRef: ref("TXN", 6),
    amount: 198,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(7),
    rawNarration: "UPI/zomato@icici/Zomato Order/ZOMATO",
    counterpartyVpa: "zomato@icici",
    mccCode: "5812",
  },

  // --- Rule-matched: Rapido (EXACT_VPA → TRAVEL_COMMUTE) ---
  {
    bankTxnRef: ref("TXN", 7),
    amount: 65,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(1),
    rawNarration: "UPI/rapido@paytm/Rapido Ride/RAPIDO",
    counterpartyVpa: "rapido@paytm",
    mccCode: "4121",
  },
  {
    bankTxnRef: ref("TXN", 8),
    amount: 89,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(3),
    rawNarration: "UPI/rapido@paytm/Rapido Ride/RAPIDO",
    counterpartyVpa: "rapido@paytm",
    mccCode: "4121",
  },
  {
    bankTxnRef: ref("TXN", 9),
    amount: 72,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(5),
    rawNarration: "UPI/rapido@paytm/Rapido Ride/RAPIDO",
    counterpartyVpa: "rapido@paytm",
    mccCode: "4121",
  },
  {
    bankTxnRef: ref("TXN", 10),
    amount: 55,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(8),
    rawNarration: "UPI/rapido@paytm/Rapido Ride/RAPIDO",
    counterpartyVpa: "rapido@paytm",
    mccCode: "4121",
  },

  // --- Rule-matched: REGEX electricity/broadband/rent → RENT_BILLS ---
  {
    bankTxnRef: ref("TXN", 11),
    amount: 12000,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(15),
    rawNarration: "NEFT/HDFC0001234/House Rent Payment/rent",
    counterpartyVpa: null,
    mccCode: null,
  },
  {
    bankTxnRef: ref("TXN", 12),
    amount: 1199,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(10),
    rawNarration: "ACH/AIRTEL/broadband monthly plan/AIRTEL",
    counterpartyVpa: null,
    mccCode: null,
  },
  {
    bankTxnRef: ref("TXN", 13),
    amount: 2200,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(12),
    rawNarration: "NACH/BSES/electricity bill payment/BSES",
    counterpartyVpa: null,
    mccCode: null,
  },

  // --- LLM fallback: Myntra → SHOPPING ---
  {
    bankTxnRef: ref("TXN", 14),
    amount: 1899,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(2),
    rawNarration: "UPI/myntra.bd@hdfcbank/Myntra Purchase/MYNTRA",
    counterpartyVpa: "myntra.bd@hdfcbank",
    mccCode: "5691",
  },
  {
    bankTxnRef: ref("TXN", 15),
    amount: 3299,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(9),
    rawNarration: "UPI/myntra.bd@hdfcbank/Myntra Purchase/MYNTRA",
    counterpartyVpa: "myntra.bd@hdfcbank",
    mccCode: "5691",
  },

  // --- LLM fallback: BookMyShow → OUTINGS_LEISURE ---
  {
    bankTxnRef: ref("TXN", 16),
    amount: 880,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(6),
    rawNarration: "UPI/bookmyshow@icicibank/BookMyShow Tickets/BMS",
    counterpartyVpa: "bookmyshow@icicibank",
    mccCode: "7832",
  },

  // --- LLM fallback: Big Basket → FOOD_GROCERIES ---
  {
    bankTxnRef: ref("TXN", 17),
    amount: 2150,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(5),
    rawNarration: "UPI/bigbasket@axis/BigBasket Groceries/BBT",
    counterpartyVpa: "bigbasket@axis",
    mccCode: "5411",
  },
  {
    bankTxnRef: ref("TXN", 18),
    amount: 1680,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(13),
    rawNarration: "UPI/bigbasket@axis/BigBasket Groceries/BBT",
    counterpartyVpa: "bigbasket@axis",
    mccCode: "5411",
  },

  // --- LLM fallback: Uber → TRAVEL_COMMUTE ---
  {
    bankTxnRef: ref("TXN", 19),
    amount: 234,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(2),
    rawNarration: "UPI/uber@paytm/Uber Technologies/UBER",
    counterpartyVpa: "uber@paytm",
    mccCode: "4121",
  },
  {
    bankTxnRef: ref("TXN", 20),
    amount: 312,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(4),
    rawNarration: "UPI/uber@paytm/Uber Technologies/UBER",
    counterpartyVpa: "uber@paytm",
    mccCode: "4121",
  },
  {
    bankTxnRef: ref("TXN", 21),
    amount: 189,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(7),
    rawNarration: "UPI/uber@paytm/Uber Technologies/UBER",
    counterpartyVpa: "uber@paytm",
    mccCode: "4121",
  },

  // --- LLM fallback: Other merchants ---
  {
    bankTxnRef: ref("TXN", 22),
    amount: 599,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(3),
    rawNarration: "UPI/nykaa@razorpay/Nykaa Beauty/NYKAA",
    counterpartyVpa: "nykaa@razorpay",
    mccCode: "5977",
  },
  {
    bankTxnRef: ref("TXN", 23),
    amount: 4499,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(11),
    rawNarration: "UPI/amazon@apl/Amazon Purchase/AMAZON",
    counterpartyVpa: "amazon@apl",
    mccCode: "5999",
  },
  {
    bankTxnRef: ref("TXN", 24),
    amount: 1299,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(8),
    rawNarration: "UPI/flipkart@razorpay/Flipkart Order/FLIPKART",
    counterpartyVpa: "flipkart@razorpay",
    mccCode: "5999",
  },
  {
    bankTxnRef: ref("TXN", 25),
    amount: 549,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(5),
    rawNarration: "UPI/zepto@hdfcbank/Zepto Groceries/ZEPTO",
    counterpartyVpa: "zepto@hdfcbank",
    mccCode: "5411",
  },
  {
    bankTxnRef: ref("TXN", 26),
    amount: 799,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(6),
    rawNarration: "UPI/hotstar@razorpay/Disney Hotstar/HOTSTAR",
    counterpartyVpa: "hotstar@razorpay",
    mccCode: "7994",
  },
  {
    bankTxnRef: ref("TXN", 27),
    amount: 199,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(4),
    rawNarration: "UPI/spotify@hdfc/Spotify Premium/SPOTIFY",
    counterpartyVpa: "spotify@hdfc",
    mccCode: "7929",
  },
  {
    bankTxnRef: ref("TXN", 28),
    amount: 1200,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(14),
    rawNarration: "UPI/cure.fit@icici/Cure.fit Gym/CUREFIT",
    counterpartyVpa: "cure.fit@icici",
    mccCode: "7941",
  },
  {
    bankTxnRef: ref("TXN", 29),
    amount: 320,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(9),
    rawNarration: "UPI/swiggy@axisbank/Swiggy Food/SWIGGY",
    counterpartyVpa: "swiggy@axisbank",
    mccCode: "5812",
  },
  {
    bankTxnRef: ref("TXN", 30),
    amount: 450,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(10),
    rawNarration: "UPI/zomato@icici/Zomato Order/ZOMATO",
    counterpartyVpa: "zomato@icici",
    mccCode: "5812",
  },

  // --- P2P transfers (personal VPAs, no MCC, UPI phone format) ---
  {
    bankTxnRef: ref("TXN", 31),
    amount: 2000,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(2),
    rawNarration: "UPI/9876543210/Ramesh Kumar/payment",
    counterpartyVpa: "9876543210@ybl",
    mccCode: null,
  },
  {
    bankTxnRef: ref("TXN", 32),
    amount: 500,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(4),
    rawNarration: "UPI/8765432109/Priya Sharma/dinner split",
    counterpartyVpa: "priya.sharma99@paytm",
    mccCode: null,
  },
  {
    bankTxnRef: ref("TXN", 33),
    amount: 1500,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(7),
    rawNarration: "UPI/9988776655/Ankit Gupta/rent share",
    counterpartyVpa: "9988776655@apl",
    mccCode: null,
  },
  {
    bankTxnRef: ref("TXN", 34),
    amount: 300,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(9),
    rawNarration: "UPI/7654321098/Kavya Nair/movie tickets",
    counterpartyVpa: "kavya.nair@axl",
    mccCode: null,
  },
  {
    bankTxnRef: ref("TXN", 35),
    amount: 800,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(13),
    rawNarration: "UPI/8899001122/Vikram Singh/grocery split",
    counterpartyVpa: "8899001122@ybl",
    mccCode: null,
  },

  // --- CREDIT transactions (salary, refund — excluded from Safe Limit calc) ---
  {
    bankTxnRef: ref("TXN", 36),
    amount: 80000,
    txnType: "CREDIT",
    txnTimestamp: daysAgo(15),
    rawNarration: "NEFT/TECHCORP/Salary June 2026/TECHCORP SOLUTIONS",
    counterpartyVpa: null,
    mccCode: null,
  },
  {
    bankTxnRef: ref("TXN", 37),
    amount: 1899,
    txnType: "CREDIT",
    txnTimestamp: daysAgo(8),
    rawNarration: "UPI/myntra.bd@hdfcbank/Myntra Refund/MYNTRA",
    counterpartyVpa: "myntra.bd@hdfcbank",
    mccCode: null,
  },
  {
    bankTxnRef: ref("TXN", 38),
    amount: 529,
    txnType: "CREDIT",
    txnTimestamp: daysAgo(6),
    rawNarration: "UPI/swiggy@axisbank/Swiggy Refund/SWIGGY",
    counterpartyVpa: "swiggy@axisbank",
    mccCode: null,
  },

  // --- More LLM fallback variety ---
  {
    bankTxnRef: ref("TXN", 39),
    amount: 2499,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(11),
    rawNarration: "UPI/ajio@razorpay/AJIO Fashion/AJIO",
    counterpartyVpa: "ajio@razorpay",
    mccCode: "5691",
  },
  {
    bankTxnRef: ref("TXN", 40),
    amount: 399,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(12),
    rawNarration: "UPI/dunzo@hdfcbank/Dunzo Delivery/DUNZO",
    counterpartyVpa: "dunzo@hdfcbank",
    mccCode: "5411",
  },
  {
    bankTxnRef: ref("TXN", 41),
    amount: 1499,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(14),
    rawNarration: "UPI/lenskart@icici/Lenskart Eyewear/LENSKART",
    counterpartyVpa: "lenskart@icici",
    mccCode: "5995",
  },
  {
    bankTxnRef: ref("TXN", 42),
    amount: 650,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(3),
    rawNarration: "UPI/zomato@icici/Zomato Order/ZOMATO",
    counterpartyVpa: "zomato@icici",
    mccCode: "5812",
  },
  {
    bankTxnRef: ref("TXN", 43),
    amount: 125,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(1),
    rawNarration: "UPI/rapido@paytm/Rapido Ride/RAPIDO",
    counterpartyVpa: "rapido@paytm",
    mccCode: "4121",
  },
  {
    bankTxnRef: ref("TXN", 44),
    amount: 4999,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(10),
    rawNarration: "UPI/croma@hdfcbank/Croma Electronics/CROMA",
    counterpartyVpa: "croma@hdfcbank",
    mccCode: "5732",
  },
  {
    bankTxnRef: ref("TXN", 45),
    amount: 850,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(16),
    rawNarration: "UPI/inox@razorpay/INOX Movies/INOX",
    counterpartyVpa: "inox@razorpay",
    mccCode: "7832",
  },
  {
    bankTxnRef: ref("TXN", 46),
    amount: 3200,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(6),
    rawNarration: "UPI/makemytrip@icici/MakeMyTrip Booking/MMT",
    counterpartyVpa: "makemytrip@icici",
    mccCode: "4722",
  },
  {
    bankTxnRef: ref("TXN", 47),
    amount: 2800,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(8),
    rawNarration: "UPI/swiggy@axisbank/Swiggy Instamart/SWIGGY",
    counterpartyVpa: "swiggy@axisbank",
    mccCode: "5411",
  },
  {
    bankTxnRef: ref("TXN", 48),
    amount: 1750,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(3),
    rawNarration: "UPI/pharmeasy@hdfcbank/PharmEasy Medicine/PHARMEASY",
    counterpartyVpa: "pharmeasy@hdfcbank",
    mccCode: "5912",
  },
  {
    bankTxnRef: ref("TXN", 49),
    amount: 6000,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(17),
    rawNarration: "NACH/HDFC/electricity bill payment/MSEDCL",
    counterpartyVpa: null,
    mccCode: null,
  },
  {
    bankTxnRef: ref("TXN", 50),
    amount: 299,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(5),
    rawNarration: "UPI/prime@amazon/Amazon Prime/AMAZON",
    counterpartyVpa: "prime@amazon",
    mccCode: "7929",
  },
  {
    bankTxnRef: ref("TXN", 51),
    amount: 1100,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(7),
    rawNarration: "UPI/7788990011/Sneha Pillai/flat maintenance",
    counterpartyVpa: "7788990011@ybl",
    mccCode: null,
  },
  {
    bankTxnRef: ref("TXN", 52),
    amount: 600,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(4),
    rawNarration: "UPI/zomato@icici/Zomato Pro Order/ZOMATO",
    counterpartyVpa: "zomato@icici",
    mccCode: "5812",
  },
  {
    bankTxnRef: ref("TXN", 53),
    amount: 420,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(9),
    rawNarration: "UPI/swiggy@axisbank/Swiggy Food/SWIGGY",
    counterpartyVpa: "swiggy@axisbank",
    mccCode: "5812",
  },
  {
    bankTxnRef: ref("TXN", 54),
    amount: 145,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(2),
    rawNarration: "UPI/rapido@paytm/Rapido Ride/RAPIDO",
    counterpartyVpa: "rapido@paytm",
    mccCode: "4121",
  },
  {
    bankTxnRef: ref("TXN", 55),
    amount: 2100,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(11),
    rawNarration: "UPI/nykaa@razorpay/Nykaa Fashion/NYKAA",
    counterpartyVpa: "nykaa@razorpay",
    mccCode: "5977",
  },
  {
    bankTxnRef: ref("TXN", 56),
    amount: 3800,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(13),
    rawNarration: "UPI/uber@paytm/Uber Technologies/UBER",
    counterpartyVpa: "uber@paytm",
    mccCode: "4121",
  },
  {
    bankTxnRef: ref("TXN", 57),
    amount: 950,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(6),
    rawNarration: "UPI/bigbasket@axis/BigBasket Groceries/BBT",
    counterpartyVpa: "bigbasket@axis",
    mccCode: "5411",
  },
  {
    bankTxnRef: ref("TXN", 58),
    amount: 1600,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(14),
    rawNarration: "UPI/pharmeasy@hdfcbank/Pharmeasy Order/PHARMEASY",
    counterpartyVpa: "pharmeasy@hdfcbank",
    mccCode: "5912",
  },
  {
    bankTxnRef: ref("TXN", 59),
    amount: 780,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(8),
    rawNarration: "UPI/myntra.bd@hdfcbank/Myntra Purchase/MYNTRA",
    counterpartyVpa: "myntra.bd@hdfcbank",
    mccCode: "5691",
  },
  {
    bankTxnRef: ref("TXN", 60),
    amount: 490,
    txnType: "DEBIT",
    txnTimestamp: daysAgo(3),
    rawNarration: "UPI/uber@paytm/Uber Technologies/UBER",
    counterpartyVpa: "uber@paytm",
    mccCode: "4121",
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
