
import type { PortfolioHolding } from '@/types/portfolio';

export const calculatePortfolioMetrics = (holdings: PortfolioHolding[]): PortfolioHolding[] => {
  // Calculate total value only from holdings that have a defined currentAmount
  const totalPortfolioValue = holdings.reduce((sum, h) => sum + (h.currentAmount || 0), 0);

  return holdings.map(holding => {
    let allocationPercentage: number | undefined;

    if (holding.currentAmount === undefined) {
      allocationPercentage = undefined; // If currentAmount is unknown, allocation is unknown
    } else if (totalPortfolioValue > 0) {
      allocationPercentage = (holding.currentAmount / totalPortfolioValue) * 100;
    } else {
      // If totalPortfolioValue is 0 (e.g., all amounts are 0 or undefined)
      // and currentAmount is 0, allocation is 0%.
      // If currentAmount is > 0 but total is 0 (should not happen if sum is correct), it would be 100% for this one.
      // However, currentAmount being defined but totalPortfolioValue being 0 typically means all amounts are 0.
      allocationPercentage = 0;
    }

    return {
      ...holding,
      allocationPercentage: allocationPercentage,
    };
  });
};

export const formatCurrency = (value: number | undefined, currency: string = 'EUR'): string => {
  if (value === undefined) return 'N/A';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency }).format(value);
};

export const formatPercentage = (value: number | undefined): string => {
  if (value === undefined) return 'N/A';
  return `${value.toFixed(2)}%`;
};
