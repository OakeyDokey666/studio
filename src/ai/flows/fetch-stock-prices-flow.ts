
'use server';
/**
 * @fileOverview Fetches latest stock prices and basic ETF details using Yahoo Finance.
 *
 * - fetchStockPrices - A function that takes ISINs (and optional tickers) and returns current prices and details.
 * - FetchStockPricesInput - The input type for the fetchStockPrices function.
 * - FetchStockPricesOutput - The return type for the fetchStockPrices function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import yahooFinance from 'yahoo-finance2';

const FetchStockPricesInputSchema = z.array(
  z.object({
    isin: z.string().describe('The ISIN code of the asset.'),
    id: z.string().describe('The unique ID of the holding (can be same as ISIN).'),
    ticker: z.string().optional().describe('The preferred ticker symbol for the asset.'),
  })
).describe('An array of assets with their ISIN codes, IDs, and optional ticker symbols.');
export type FetchStockPricesInput = z.infer<typeof FetchStockPricesInputSchema>;

const StockPriceDataSchema = z.object({
  id: z.string().describe('The unique ID of the holding.'),
  isin: z.string().describe('The ISIN code of the asset.'),
  currentPrice: z.number().optional().describe('The latest market price.'),
  currency: z.string().optional().describe('The currency of the price.'),
  symbol: z.string().optional().describe('The ticker symbol found on Yahoo Finance.'),
  exchange: z.string().optional().describe('The exchange the price was sourced from (e.g., PAR, LSE).'),
  regularMarketChange: z.number().optional().describe('The change in price from the previous close.'),
  regularMarketChangePercent: z.number().optional().describe('The percentage change in price from the previous close.'),
  regularMarketVolume: z.number().optional().describe('Current trading volume.'),
  averageDailyVolume10Day: z.number().optional().describe('Average daily trading volume over 10 days.'),
  marketCap: z.number().optional().describe('Market capitalization.'),
  trailingPE: z.number().optional().describe('Trailing Price-to-Earnings ratio.'),
  epsTrailingTwelveMonths: z.number().optional().describe('Earnings Per Share over the trailing twelve months.'),
  fiftyTwoWeekLow: z.number().optional().describe('The lowest price in the past 52 weeks.'),
  fiftyTwoWeekHigh: z.number().optional().describe('The highest price in the past 52 weeks.'),
  ter: z.number().optional().describe('Total Expense Ratio (annual).'),
  fundSize: z.number().optional().describe('Fund Size / Assets Under Management (AUM).'),
});
export type StockPriceData = z.infer<typeof StockPriceDataSchema>;

const FetchStockPricesOutputSchema = z.array(StockPriceDataSchema).describe('An array of stock price data for the requested assets.');
export type FetchStockPricesOutput = z.infer<typeof FetchStockPricesOutputSchema>;


async function getPriceForIsin(isin: string, id: string, preferredTicker?: string): Promise<StockPriceData> {
  let quote;
  const euronextExchangeCodes = ['PAR', 'AMS', 'BRU', 'LIS', 'DUB', 'MCE', 'OSL']; // Paris, Amsterdam, Brussels, Lisbon, Dublin, Madrid, Oslo
  const baseReturnData = { id, isin, symbol: preferredTicker };

  const extractQuoteData = (q: any): StockPriceData => ({
    id,
    isin,
    currentPrice: q.regularMarketPrice,
    currency: q.currency,
    symbol: q.symbol || preferredTicker,
    exchange: q.exchange,
    regularMarketChange: q.regularMarketChange,
    regularMarketChangePercent: q.regularMarketChangePercent,
    regularMarketVolume: q.regularMarketVolume,
    averageDailyVolume10Day: q.averageDailyVolume10Day || q.averageDailyVolume3Month,
    marketCap: q.marketCap,
    trailingPE: q.trailingPE,
    epsTrailingTwelveMonths: q.epsTrailingTwelveMonths,
    fiftyTwoWeekLow: q.fiftyTwoWeekLow,
    fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
    ter: q.fundProfile?.annualReportExpenseRatio?.raw ?? q.annualReportExpenseRatio?.raw, // TER from fundProfile or directly
    fundSize: q.summaryDetail?.totalAssets?.raw ?? q.summaryProfile?.totalAssets?.raw, // AUM from summaryDetail or summaryProfile
  });
  

  // Attempt 0: Use preferredTicker if provided
  if (preferredTicker) {
    try {
      quote = await yahooFinance.quote(preferredTicker);
      if (quote && quote.regularMarketPrice && quote.currency) {
        if (quote.currency.toUpperCase() === 'EUR') {
          return extractQuoteData(quote);
        } else {
          console.warn(`Preferred ticker ${preferredTicker} for ISIN ${isin} (ID: ${id}) found price in ${quote.currency}, not EUR. Falling back to ISIN search.`);
        }
      }
    } catch (error) {
      console.warn(`Failed to fetch price for preferred ticker ${preferredTicker} (ISIN: ${isin}, ID: ${id}). Error: ${error instanceof Error ? error.message : String(error)}. Falling back to ISIN search.`);
    }
  }

  // Attempt 1: Directly use ISIN as symbol (works for some major exchanges)
  try {
    quote = await yahooFinance.quote(isin);
    if (quote && quote.regularMarketPrice && quote.currency && quote.currency.toUpperCase() === 'EUR') {
      return extractQuoteData(quote);
    }
  } catch (error) {
     // console.warn(`Direct quote with ISIN ${isin} failed or not in EUR. Will try searching.`);
  }

  // Attempt 2: Search by ISIN to get a ticker symbol
  try {
    const searchResults = await yahooFinance.search(isin);
    if (searchResults.quotes && searchResults.quotes.length > 0) {
      let bestMatch;

      bestMatch = searchResults.quotes.find(q =>
        q.isin === isin &&
        q.currency?.toUpperCase() === 'EUR' &&
        euronextExchangeCodes.some(exCode => q.exchange?.toUpperCase() === exCode)
      );

      if (!bestMatch) {
        bestMatch = searchResults.quotes.find(q => q.isin === isin && q.currency?.toUpperCase() === 'EUR');
      }
      
      if (!bestMatch && preferredTicker) {
        bestMatch = searchResults.quotes.find(q => q.symbol === preferredTicker && q.isin === isin && q.currency?.toUpperCase() === 'EUR');
      }
      
      if (!bestMatch) {
        bestMatch = searchResults.quotes.find(q => q.isin === isin && q.currency?.toUpperCase() === 'EUR');
      }
      
      if (!bestMatch) {
        bestMatch = searchResults.quotes.find(q => q.isin === isin && q.regularMarketPrice && q.currency);
      }

      if (!bestMatch && !preferredTicker) {
        bestMatch = searchResults.quotes.find(q => q.isin === isin);
      }


      if (bestMatch && bestMatch.symbol) {
        quote = await yahooFinance.quote(bestMatch.symbol);
        if (quote && quote.regularMarketPrice && quote.currency) {
          return extractQuoteData(quote);
        }
      }
    }
  } catch (error) {
     console.error(`Error during search or quote for ISIN ${isin} (ID: ${id}):`, error);
  }
  
  console.warn(`Could not find EUR price for ISIN ${isin} (ID: ${id}, Ticker: ${preferredTicker}) after all attempts. Best symbol found: ${quote?.symbol || 'N/A'}`);
  // Return base data even if quote is partial or missing
  const returnData: StockPriceData = { 
    ...baseReturnData,
    symbol: quote?.symbol || preferredTicker, 
    exchange: quote?.exchange,
    regularMarketChange: quote?.regularMarketChange,
    regularMarketChangePercent: quote?.regularMarketChangePercent,
    regularMarketVolume: quote?.regularMarketVolume,
    averageDailyVolume10Day: quote?.averageDailyVolume10Day || quote?.averageDailyVolume3Month,
    marketCap: quote?.marketCap,
    trailingPE: quote?.trailingPE,
    epsTrailingTwelveMonths: quote?.epsTrailingTwelveMonths,
    fiftyTwoWeekLow: quote?.fiftyTwoWeekLow,
    fiftyTwoWeekHigh: quote?.fiftyTwoWeekHigh,
    ter: quote?.fundProfile?.annualReportExpenseRatio?.raw ?? quote?.annualReportExpenseRatio?.raw,
    fundSize: quote?.summaryDetail?.totalAssets?.raw ?? quote?.summaryProfile?.totalAssets?.raw,
  };
  return returnData;
}


export async function fetchStockPrices(input: FetchStockPricesInput): Promise<FetchStockPricesOutput> {
  return fetchStockPricesFlow(input);
}

const fetchStockPricesFlow = ai.defineFlow(
  {
    name: 'fetchStockPricesFlow',
    inputSchema: FetchStockPricesInputSchema,
    outputSchema: FetchStockPricesOutputSchema,
  },
  async (assets) => {
    const pricePromises = assets.map(asset => getPriceForIsin(asset.isin, asset.id, asset.ticker));
    const results = await Promise.all(pricePromises);
    return results.filter(r => r !== null) as StockPriceData[];
  }
);
