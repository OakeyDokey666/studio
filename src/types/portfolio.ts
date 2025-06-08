
export interface PortfolioHolding {
  id: string; // ISIN
  name: string;
  quantity: number;
  currentPrice: number;
  currentAmount: number;
  objective: string;
  type: string;
  potentialIncome: string;
  allocationPercentage?: number; // Current allocation, calculated
  targetBuyAmount: number;
  buyPrice?: number;
  qtyToBuy?: number;
  actualGrosAmount?: number;
  isin: string;
  distributes?: string;
  targetAllocationPercentage?: number; // Target allocation, calculated from targetBuyAmount
  ticker?: string; // Optional ticker symbol
  priceSourceExchange?: string; // Exchange from which the current price was sourced
}

export interface ParsedCsvData {
  holdings: PortfolioHolding[];
  initialNewInvestmentAmount?: number;
  csvErrors?: string[];
}
