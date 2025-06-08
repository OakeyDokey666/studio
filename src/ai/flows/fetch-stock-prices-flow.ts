
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
  ter: z.number().optional().describe('Total Expense Ratio (annual) from fundProfile.annualReportExpenseRatio.raw.'),
  fundSize: z.number().optional().describe('Fund Size / Assets Under Management (AUM) from fundProfile.totalAssets.raw.'),
  categoryName: z.string().optional().describe('Fund category from fundProfile.categoryName.'),
});
export type StockPriceData = z.infer<typeof StockPriceDataSchema>;

const FetchStockPricesOutputSchema = z.array(StockPriceDataSchema).describe('An array of stock price data for the requested assets.');
export type FetchStockPricesOutput = z.infer<typeof FetchStockPricesOutputSchema>;


async function getPriceForIsin(isin: string, id: string, preferredTicker?: string): Promise<StockPriceData> {
  let quote; // This will hold the last quote object processed, potentially non-EUR or incomplete
  const euronextExchangeCodes = ['PAR', 'AMS', 'BRU', 'LIS', 'DUB', 'MCE', 'OSL']; // Paris, Amsterdam, Brussels, Lisbon, Dublin, Madrid, Oslo
  
  const extractQuoteData = (q: any): StockPriceData => ({
    id,
    isin,
    currentPrice: q.regularMarketPrice,
    currency: q.currency,
    symbol: q.symbol || preferredTicker, // Use symbol from quote if available, else preferred ticker
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
    ter: q.fundProfile?.annualReportExpenseRatio?.raw,
    fundSize: q.fundProfile?.totalAssets?.raw ?? q.summaryDetail?.totalAssets?.raw ?? q.summaryProfile?.totalAssets?.raw,
    categoryName: q.fundProfile?.categoryName,
  });
  

  // Attempt 0: Use preferredTicker if provided
  if (preferredTicker) {
    try {
      const preferredQuote = await yahooFinance.quote(preferredTicker, { fields: ['price', 'summaryDetail', 'summaryProfile', 'fundProfile', 'defaultKeyStatistics', 'financialData'] });
      if (preferredQuote) {
        if (preferredQuote.regularMarketPrice !== undefined && preferredQuote.currency) {
          if (preferredQuote.currency.toUpperCase() === 'EUR') {
            return extractQuoteData(preferredQuote);
          } else {
            quote = preferredQuote; // Store non-EUR quote
            console.warn(`Preferred ticker ${preferredTicker} for ISIN ${isin} (ID: ${id}) found price in ${preferredQuote.currency}, not EUR. Falling back.`);
          }
        } else {
          quote = preferredQuote; // Store incomplete quote
        }
      }
    } catch (error) {
      console.warn(`Failed to fetch price for preferred ticker ${preferredTicker} (ISIN: ${isin}, ID: ${id}). Error: ${error instanceof Error ? error.message : String(error)}. Falling back.`);
    }
  }

  // Attempt 1: Directly use ISIN as symbol
  try {
    const isinQuote = await yahooFinance.quote(isin, { fields: ['price', 'summaryDetail', 'summaryProfile', 'fundProfile', 'defaultKeyStatistics', 'financialData'] });
    if (isinQuote) {
      if (isinQuote.regularMarketPrice !== undefined && isinQuote.currency) {
        if (isinQuote.currency.toUpperCase() === 'EUR') {
          return extractQuoteData(isinQuote);
        } else if (!quote || quote.currency?.toUpperCase() !== 'EUR') { // Prefer this if current `quote` is bad/non-EUR
          quote = isinQuote;
        }
      } else if (!quote) {
        quote = isinQuote;
      }
    }
  } catch (error) {
     console.warn(`Direct quote with ISIN ${isin} (ID: ${id}) failed. Error: ${error instanceof Error ? error.message : String(error)}. Will try searching.`);
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
      
      if (!bestMatch && preferredTicker) { // Check preferred ticker against search results
        bestMatch = searchResults.quotes.find(q => q.symbol === preferredTicker && q.isin === isin && q.currency?.toUpperCase() === 'EUR');
      }
      
      if (!bestMatch) { // Broader search for EUR ISIN match
        bestMatch = searchResults.quotes.find(q => q.isin === isin && q.currency?.toUpperCase() === 'EUR');
      }
      
      if (!bestMatch) { // Fallback to any ISIN match with price and currency
        bestMatch = searchResults.quotes.find(q => q.isin === isin && q.regularMarketPrice && q.currency);
      }

      if (!bestMatch && !preferredTicker) { // Last resort if no preferred ticker, any ISIN match
        bestMatch = searchResults.quotes.find(q => q.isin === isin);
      }


      if (bestMatch && bestMatch.symbol) {
        const searchDerivedQuote = await yahooFinance.quote(bestMatch.symbol, { fields: ['price', 'summaryDetail', 'summaryProfile', 'fundProfile', 'defaultKeyStatistics', 'financialData'] });
        if (searchDerivedQuote) {
          if (searchDerivedQuote.regularMarketPrice !== undefined && searchDerivedQuote.currency) {
            if (searchDerivedQuote.currency.toUpperCase() === 'EUR') { // CRITICAL: Check for EUR here
              return extractQuoteData(searchDerivedQuote);
            } else if (!quote || quote.currency?.toUpperCase() !== 'EUR') {
              quote = searchDerivedQuote;
            }
          } else if (!quote) {
            quote = searchDerivedQuote;
          }
        }
      }
    }
  } catch (error) {
     console.error(`Error during search or subsequent quote for ISIN ${isin} (ID: ${id}):`, error);
  }
  
  // Fallback: If no EUR price was found and returned earlier
  let finalPrice = quote?.regularMarketPrice;
  let finalCurrency = quote?.currency;
  let finalSymbol = quote?.symbol || preferredTicker;

  if (finalPrice !== undefined && finalCurrency && finalCurrency.toUpperCase() !== 'EUR') {
    console.warn(`getPriceForIsin (ISIN: ${isin}, ID: ${id}): Final quote for symbol ${finalSymbol} was in ${finalCurrency}. Discarding price.`);
    finalPrice = undefined;
    finalCurrency = undefined;
  } else if (finalPrice === undefined) {
    console.warn(`getPriceForIsin (ISIN: ${isin}, ID: ${id}): No price found after all attempts for symbol ${finalSymbol}.`);
  } else {
    // Price is defined and currency is EUR (or currency was undefined but price was somehow found)
    console.log(`getPriceForIsin (ISIN: ${isin}, ID: ${id}): Successfully determined EUR price ${finalPrice} for symbol ${finalSymbol}.`);
  }

  const returnData: StockPriceData = {
    id,
    isin,
    currentPrice: finalPrice,
    currency: finalCurrency,
    symbol: finalSymbol,
    exchange: quote?.exchange,
    regularMarketChange: finalPrice !== undefined ? quote?.regularMarketChange : undefined,
    regularMarketChangePercent: finalPrice !== undefined ? quote?.regularMarketChangePercent : undefined,
    regularMarketVolume: quote?.regularMarketVolume,
    averageDailyVolume10Day: quote?.averageDailyVolume10Day || quote?.averageDailyVolume3Month,
    marketCap: quote?.marketCap,
    trailingPE: quote?.trailingPE,
    epsTrailingTwelveMonths: quote?.epsTrailingTwelveMonths,
    fiftyTwoWeekLow: quote?.fiftyTwoWeekLow,
    fiftyTwoWeekHigh: quote?.fiftyTwoWeekHigh,
    ter: quote?.fundProfile?.annualReportExpenseRatio?.raw,
    fundSize: quote?.fundProfile?.totalAssets?.raw ?? quote?.summaryDetail?.totalAssets?.raw ?? quote?.summaryProfile?.totalAssets?.raw,
    categoryName: quote?.fundProfile?.categoryName,
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
    return results.filter(r => r !== null) as StockPriceData[]; // filter out nulls if any promise rejects to null, though getPriceForIsin always returns StockPriceData
  }
);

