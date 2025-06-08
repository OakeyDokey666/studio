
import type { PortfolioHolding, RoundingOption } from '@/types/portfolio';

export const calculatePortfolioMetrics = (
  holdings: PortfolioHolding[],
  newInvestmentAmountTotal?: number,
  roundingOption?: RoundingOption
): PortfolioHolding[] => {
  const totalPortfolioValue = holdings.reduce((sum, h) => sum + (h.currentAmount || 0), 0);

  return holdings.map(holding => {
    let allocationPercentage: number | undefined;
    if (holding.currentAmount === undefined) {
      allocationPercentage = undefined;
    } else if (totalPortfolioValue > 0) {
      allocationPercentage = (holding.currentAmount / totalPortfolioValue) * 100;
    } else {
      allocationPercentage = 0;
    }

    let newInvestmentAllocation: number | undefined;
    let quantityToBuyFromNewInvestment: number | undefined;

    if (newInvestmentAmountTotal && newInvestmentAmountTotal > 0 && holding.targetAllocationPercentage && holding.targetAllocationPercentage > 0) {
      newInvestmentAllocation = newInvestmentAmountTotal * (holding.targetAllocationPercentage / 100);
      if (holding.currentPrice && holding.currentPrice > 0 && newInvestmentAllocation > 0 && roundingOption) {
        quantityToBuyFromNewInvestment = roundQuantity(newInvestmentAllocation / holding.currentPrice, roundingOption);
      }
    }

    return {
      ...holding,
      allocationPercentage: allocationPercentage,
      newInvestmentAllocation: newInvestmentAllocation,
      quantityToBuyFromNewInvestment: quantityToBuyFromNewInvestment,
    };
  });
};

export const formatCurrency = (value: number | undefined, currency: string = 'EUR'): string => {
  if (value === undefined || isNaN(value)) return 'N/A';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency }).format(value);
};

export const formatPercentage = (value: number | undefined): string => {
  if (value === undefined || isNaN(value)) return 'N/A';
  return `${value.toFixed(2)}%`;
};

export const roundQuantity = (value: number, option: RoundingOption): number => {
  if (isNaN(value)) return 0; // Or handle error appropriately
  switch (option) {
    case 'up':
      return Math.ceil(value);
    case 'down':
      return Math.floor(value);
    case 'classic':
      return Math.round(value);
    default:
      return Math.round(value); // Default to classic
  }
};
