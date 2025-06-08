
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
  regularMarketChange?: number; // Absolute change from previous close
  regularMarketChangePercent?: number; // Percentage change from previous close

  // Additional financial details for popover
  regularMarketVolume?: number;
  averageDailyVolume10Day?: number;
  marketCap?: number;
  trailingPE?: number;
  epsTrailingTwelveMonths?: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHigh?: number;

  // ETF specific details
  ter?: number; // Total Expense Ratio
  fundSize?: number; // Assets Under Management (AUM)
  // replicationMethod?: string; // Best added via CSV
  // distributionPolicy?: string; // Detailed policy, existing 'distributes' for months
}

export interface ParsedCsvData {
  holdings: PortfolioHolding[];
  initialNewInvestmentAmount?: number;
  csvErrors?: string[];
}

export type RoundingOption = 'up' | 'down' | 'classic';
