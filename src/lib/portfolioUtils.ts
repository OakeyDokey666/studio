import type { PortfolioHolding } from '@/types/portfolio';

export const calculatePortfolioMetrics = (holdings: PortfolioHolding[]): PortfolioHolding[] => {
  const totalPortfolioValue = holdings.reduce((sum, h) => sum + h.currentAmount, 0);

  return holdings.map(holding => ({
    ...holding,
    allocationPercentage: totalPortfolioValue > 0 ? (holding.currentAmount / totalPortfolioValue) * 100 : 0,
  }));
};

export const formatCurrency = (value: number | undefined, currency: string = 'EUR'): string => {
  if (value === undefined) return 'N/A';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency }).format(value);
};

export const formatPercentage = (value: number | undefined): string => {
  if (value === undefined) return 'N/A';
  return `${value.toFixed(2)}%`;
};
