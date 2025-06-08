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
    
    // Determine if comma is decimal or thousands separator
    // If it contains a period, assume period is decimal and comma is thousands
    // Otherwise, assume comma is decimal
    let normalizedValue: string;
    if (cleanedValue.includes('.') && cleanedValue.includes(',')) {
      // Handles cases like "1,234.56" (comma as thousands, period as decimal)
      // or "1.234,56" (period as thousands, comma as decimal)
      if (cleanedValue.lastIndexOf(',') > cleanedValue.lastIndexOf('.')) {
        // Comma is decimal, period is thousands: "1.234,56" -> 1234.56
        normalizedValue = cleanedValue.replace(/\./g, '').replace(',', '.');
      } else {
        // Period is decimal, comma is thousands: "1,234.56" -> 1234.56
        normalizedValue = cleanedValue.replace(/,/g, '');
      }
    } else if (cleanedValue.includes(',')) {
      // Only comma present, assume it's a decimal: "123,45" -> 123.45
      normalizedValue = cleanedValue.replace(',', '.');
    } else {
      // No comma, direct parse: "123.45" or "123"
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

  const header = lines[0].split(',').map(h => h.trim());
  const expectedHeaders = ['Name','Quantity','Current Price euros (euronext)','Current amount','Objective','Type','Potential income','Allocation %','Target buy amount','Buy Price','Qty to buy','Actual gros amount','ISIN','Distributes'];
  
  // Basic header validation
  if (header.length < expectedHeaders.length -1) { // -1 because Distributes can be empty at end of line
     csvErrors.push(`CSV header mismatch. Expected at least ${expectedHeaders.length - 1} columns, got ${header.length}. Header: ${lines[0]}`);
  }


  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Regex to split by comma, handling quoted fields
    const values = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map(v => v.replace(/^"|"$/g, '').trim()) || [];

    if (values.length === 0) continue;

    if (values[0]?.toLowerCase() === 'total') {
      // Example: Total,"€910,00",,,,Enter New investment amount ,1000, ...
      // New investment amount seems to be at index 6 (0-indexed) after "Enter New investment amount"
      // But values array might be shorter due to empty cells. Let's find "Enter New investment amount"
      const newInvestmentLabelIndex = line.toLowerCase().indexOf("enter new investment amount");
      if (newInvestmentLabelIndex !== -1) {
        const partAfterLabel = line.substring(newInvestmentLabelIndex + "enter new investment amount".length);
        const amountMatch = partAfterLabel.match(/,\s*(\d+)/);
        if (amountMatch && amountMatch[1]) {
          initialNewInvestmentAmount = parseNumericValue(amountMatch[1]);
        }
      }
      continue; 
    }
    
    if (values[0]?.toLowerCase() === 'qty rounding') {
        continue; // Skip this metadata line
    }

    if (values.length < 13) { // ISIN is the 13th column (0-indexed 12)
      csvErrors.push(`Skipping line ${i+1} due to insufficient columns: ${line}`);
      continue;
    }
    
    const currentPrice = parseNumericValue(values[2]);
    const quantity = parseNumericValue(values[1]);

    const holding: PortfolioHolding = {
      name: values[0] || 'N/A',
      quantity: quantity ?? 0,
      currentPrice: currentPrice ?? 0,
      currentAmount: (quantity ?? 0) * (currentPrice ?? 0), // Calculate current amount
      objective: values[4] || '',
      type: values[5] || 'ETF', // Default to ETF if not specified
      potentialIncome: values[6] || '',
      // Allocation % from CSV (values[7]) is target allocation based on target buy amount, handled later
      targetBuyAmount: parseNumericValue(values[8]) ?? 0,
      buyPrice: parseNumericValue(values[9]),
      qtyToBuy: parseNumericValue(values[10]),
      actualGrosAmount: parseNumericValue(values[11]),
      isin: values[12] || `UNKNOWN_ISIN_${i}`,
      id: values[12] || `UNKNOWN_ISIN_${i}`,
      distributes: values[13] || undefined,
    };
    holdings.push(holding);
  }
  
  // Calculate target allocation percentages
  const totalTargetBuyAmount = holdings.reduce((sum, h) => sum + h.targetBuyAmount, 0);
  if (totalTargetBuyAmount > 0) {
    holdings.forEach(h => {
      h.targetAllocationPercentage = (h.targetBuyAmount / totalTargetBuyAmount) * 100;
    });
  }


  return { holdings, initialNewInvestmentAmount, csvErrors };
};
