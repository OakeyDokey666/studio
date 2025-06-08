
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

  // If an empty string is passed for currency, format as a decimal number
  // This is to support cases where only the number format is needed without the symbol.
  if (currency === '') {
    return new Intl.NumberFormat('de-DE', {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  // Default behavior: format as currency with the provided currency code
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency }).format(value);
  } catch (e) {
    // Fallback or error logging if currency code is still invalid for some reason
    console.error(`Error formatting currency with code '${currency}':`, e);
    // Fallback to formatting as a simple decimal, or return 'N/A' or the value itself
    return new Intl.NumberFormat('de-DE', {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value) + ` (Invalid Code: ${currency})`;
  }
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
