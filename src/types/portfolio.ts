
export interface PortfolioHolding {
  id: string; // ISIN
  name: string;
  quantity: number;
  currentPrice?: number;
  currentAmount?: number;
  objective: string;
  type: string;
  potentialIncome: string;
  allocationPercentage?: number;
  targetBuyAmount: number;
  buyPrice?: number;
  qtyToBuy?: number;
  actualGrosAmount?: number;
  isin: string;
  distributes?: string;
  targetAllocationPercentage?: number;
  ticker?: string;
  priceSourceExchange?: string;

  // Fields for name popover (from fundProfile)
  ter?: number; // Total Expense Ratio
  fundSize?: number; // Assets Under Management
  categoryName?: string;

  // Fields for new investment calculation (dependent on currentPrice)
  newInvestmentAllocation?: number;
  quantityToBuyFromNewInvestment?: number;
}

export interface ParsedCsvData {
  holdings: PortfolioHolding[];
  initialNewInvestmentAmount?: number;
  csvErrors?: string[];
}

export type RoundingOption = 'up' | 'down' | 'classic';
