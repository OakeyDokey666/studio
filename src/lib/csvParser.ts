
import type { PortfolioHolding, ParsedCsvData } from '@/types/portfolio';

// Helper to parse numbers that might have € symbol, % symbol, and use comma as decimal separator
const parseNumericValue = (value: string | undefined): number | undefined => {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  try {
    const cleanedValue = value
      .replace(/€/g, '')
      .replace(/%/g, '')
      .trim();
    
    let normalizedValue: string;
    if (cleanedValue.includes('.') && cleanedValue.includes(',')) {
      if (cleanedValue.lastIndexOf(',') > cleanedValue.lastIndexOf('.')) {
        normalizedValue = cleanedValue.replace(/\./g, '').replace(',', '.');
      } else {
        normalizedValue = cleanedValue.replace(/,/g, '');
      }
    } else if (cleanedValue.includes(',')) {
      normalizedValue = cleanedValue.replace(',', '.');
    } else {
      normalizedValue = cleanedValue;
    }

    const num = parseFloat(normalizedValue);
    return isNaN(num) ? undefined : num;
  } catch (error) {
    console.warn(`Could not parse numeric value: ${value}`, error);
    return undefined;
  }
};


export const parsePortfolioCSV = (csvString: string): ParsedCsvData => {
  const lines = csvString.trim().split('\n');
  const holdings: PortfolioHolding[] = [];
  let initialNewInvestmentAmount: number | undefined;
  const csvErrors: string[] = [];

  if (lines.length < 2) {
    csvErrors.push("CSV data is too short or empty.");
    return { holdings, initialNewInvestmentAmount, csvErrors };
  }

  const headerLine = lines[0].split(',').map(h => h.trim().toLowerCase());
  const expectedHeaders = ['name','quantity','current price euros (euronext)','current amount','objective','type','potential income','allocation %','target buy amount','buy price','qty to buy','actual gros amount','isin','distributes'];
  
  // Find index of 'ticker' column if it exists, case-insensitive
  const tickerIndex = headerLine.indexOf('ticker');


  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const values = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map(v => v.replace(/^"|"$/g, '').trim()) || [];

    if (values.length === 0) continue;

    if (values[0]?.toLowerCase() === 'total') {
      const newInvestmentLabelIndex = line.toLowerCase().indexOf("enter new investment amount");
      if (newInvestmentLabelIndex !== -1) {
        const partAfterLabel = line.substring(newInvestmentLabelIndex + "enter new investment amount".length);
        const amountMatch = partAfterLabel.match(/,\s*([^,]+)/); // Capture value after comma
        if (amountMatch && amountMatch[1]) {
          initialNewInvestmentAmount = parseNumericValue(amountMatch[1].trim());
        }
      }
      continue; 
    }
    
    if (values[0]?.toLowerCase() === 'qty rounding') {
        continue;
    }

    if (values.length < 13) { 
      csvErrors.push(`Skipping line ${i+1} due to insufficient columns (found ${values.length}, expected at least 13 for ISIN): ${line}`);
      continue;
    }
    
    const currentPrice = parseNumericValue(values[2]);
    const quantity = parseNumericValue(values[1]);

    const holding: PortfolioHolding = {
      name: values[0] || 'N/A',
      quantity: quantity ?? 0,
      currentPrice: currentPrice ?? 0,
      currentAmount: (quantity ?? 0) * (currentPrice ?? 0),
      objective: values[4] || '',
      type: values[5] || 'ETF',
      potentialIncome: values[6] || '',
      targetBuyAmount: parseNumericValue(values[8]) ?? 0,
      buyPrice: parseNumericValue(values[9]),
      qtyToBuy: parseNumericValue(values[10]),
      actualGrosAmount: parseNumericValue(values[11]),
      isin: values[12] || `UNKNOWN_ISIN_${i}`,
      id: values[12] || `UNKNOWN_ISIN_${i}`, // Use ISIN as ID
      distributes: values[13] || undefined,
      ticker: tickerIndex !== -1 && values[tickerIndex] ? values[tickerIndex] : undefined,
    };
    holdings.push(holding);
  }
  
  const totalTargetBuyAmount = holdings.reduce((sum, h) => sum + h.targetBuyAmount, 0);
  if (totalTargetBuyAmount > 0) {
    holdings.forEach(h => {
      h.targetAllocationPercentage = (h.targetBuyAmount / totalTargetBuyAmount) * 100;
    });
  }

  return { holdings, initialNewInvestmentAmount, csvErrors };
};
