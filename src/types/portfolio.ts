
export interface PortfolioHolding {
  id: string; // ISIN
  name: string;
  quantity: number;
  currentPrice?: number; // Should be initially undefined, then fetched
  currentAmount?: number; // Should be initially undefined, then calculated
  objective: string;
  type: string;
  potentialIncome: string;
  allocationPercentage?: number; // Current allocation, calculated
  targetBuyAmount: number;
  buyPrice?: number;
  qtyToBuy?: number; // From CSV
  actualGrosAmount?: number;
  isin: string;
  distributes?: string;
  targetAllocationPercentage?: number; // Target allocation, calculated from targetBuyAmount
  ticker?: string; // Optional ticker symbol
  priceSourceExchange?: string; // Exchange from which the current price was sourced
  newInvestmentAllocation?: number; // Calculated: newInvestmentAmount * targetAllocationPercentage
  quantityToBuyFromNewInvestment?: number; // Calculated: newInvestmentAllocation / currentPrice, then rounded
  
  // Additional financial details for price popover
  regularMarketVolume?: number;
  averageDailyVolume10Day?: number;
  marketCap?: number;
  trailingPE?: number;
  epsTrailingTwelveMonths?: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHigh?: number;

  // ETF specific details for name popover
  ter?: number; // Total Expense Ratio from fundProfile.annualReportExpenseRatio.raw
  fundSize?: number; // Assets Under Management (AUM) from fundProfile.totalAssets.raw
  categoryName?: string; // Fund category from fundProfile.categoryName
}

export interface ParsedCsvData {
  holdings: PortfolioHolding[];
  initialNewInvestmentAmount?: number;
  csvErrors?: string[];
}

export type RoundingOption = 'up' | 'down' | 'classic';

