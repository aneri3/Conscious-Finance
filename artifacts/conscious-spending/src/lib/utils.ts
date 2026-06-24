import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRupee(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
}

export function formatFriendlyDate(isoString: string) {
  const date = new Date(isoString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return new Intl.DateTimeFormat('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(date);
  }
}

// Color logic
const COLORS = {
  green: [99, 153, 34],
  amber: [239, 159, 39],
  red: [226, 75, 74],
};

function interpolateColor(color1: number[], color2: number[], factor: number) {
  const result = color1.slice();
  for (let i = 0; i < 3; i++) {
    result[i] = Math.round(result[i] + factor * (color2[i] - color1[i]));
  }
  return result;
}

export function getSafeLimitColor(percentUsed: number) {
  let rgb: number[];
  
  if (percentUsed <= 87.5) {
    const factor = percentUsed / 87.5;
    rgb = interpolateColor(COLORS.green, COLORS.amber, factor);
  } else if (percentUsed <= 112.5) {
    const factor = (percentUsed - 87.5) / (112.5 - 87.5);
    rgb = interpolateColor(COLORS.amber, COLORS.red, factor);
  } else {
    rgb = COLORS.red;
  }
  
  return {
    rgb: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
    bgRgba: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.1)`,
  };
}

export const categoryColors: Record<string, string> = {
  "FOOD": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  "TRANSPORT": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  "SHOPPING": "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
  "BILLS": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  "ENTERTAINMENT": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  "GROCERIES": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  "UNCATEGORIZED": "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
};

export function getCategoryColor(code: string | null | undefined) {
  if (!code) return categoryColors["UNCATEGORIZED"];
  return categoryColors[code] || categoryColors["UNCATEGORIZED"];
}

export function cleanNarration(narration: string) {
  // basic cleanup logic
  return narration
    .replace(/UPI\/P2M\//g, '')
    .replace(/UPI\/P2P\//g, '')
    .split('/')[0]
    .trim() || narration;
}