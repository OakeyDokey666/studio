
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
  fundSize: z.number().optional().describe('Fund Size / Assets Under Management (AUM) from fundProfile.totalAssets.raw or summaryDetail.totalAssets.raw.'),
});
export type StockPriceData = z.infer<typeof StockPriceDataSchema>;

const FetchStockPricesOutputSchema = z.array(StockPriceDataSchema).describe('An array of stock price data for the requested assets.');
export type FetchStockPricesOutput = z.infer<typeof FetchStockPricesOutputSchema>;


async function getPriceForIsin(isin: string, id: string, preferredTicker?: string): Promise<StockPriceData> {
  console.log(`\n[getPriceForIsin] Processing ISIN: ${isin}, ID: ${id}, Ticker: ${preferredTicker}`);
  let quote;
  const euronextExchangeCodes = ['PAR', 'AMS', 'BRU', 'LIS', 'DUB', 'MCE', 'OSL'];
  const fieldsToFetch = ['price', 'summaryDetail', 'summaryProfile', 'fundProfile', 'defaultKeyStatistics', 'financialData'];

  const extractQuoteData = (q: any, attemptName: string): StockPriceData => {
    console.log(`[getPriceForIsin - ${attemptName}] Extracting from quote: P=${q.regularMarketPrice} C=${q.currency} S=${q.symbol} E=${q.exchange}`);
    return {
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
      ter: q.fundProfile?.annualReportExpenseRatio?.raw,
      fundSize: q.fundProfile?.totalAssets?.raw ?? q.summaryDetail?.totalAssets?.raw,
    };
  };

  // Attempt 0: Preferred Ticker
  if (preferredTicker) {
    try {
      console.log(`[getPriceForIsin] Attempt 0: Fetching preferred ticker ${preferredTicker}`);
      const preferredQuote = await yahooFinance.quote(preferredTicker, { fields: fieldsToFetch });
      if (preferredQuote?.regularMarketPrice !== undefined && preferredQuote.currency === 'EUR') {
        console.log(`[getPriceForIsin] Attempt 0: EUR price found for ${preferredTicker}.`);
        return extractQuoteData(preferredQuote, "Attempt 0 - Preferred Ticker EUR");
      }
      if (preferredQuote) quote = preferredQuote; // Store if non-EUR or incomplete, to potentially use its symbol later
      console.log(`[getPriceForIsin] Attempt 0: ${preferredTicker} - P=${preferredQuote?.regularMarketPrice} C=${preferredQuote?.currency}. Storing and falling back.`);
    } catch (error) {
      console.error(`[getPriceForIsin] Attempt 0: Error for ${preferredTicker}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Attempt 1: ISIN as Symbol
  try {
    console.log(`[getPriceForIsin] Attempt 1: Fetching ISIN as symbol ${isin}`);
    const isinQuote = await yahooFinance.quote(isin, { fields: fieldsToFetch });
    if (isinQuote?.regularMarketPrice !== undefined && isinQuote.currency === 'EUR') {
      console.log(`[getPriceForIsin] Attempt 1: EUR price found for ISIN ${isin}.`);
      return extractQuoteData(isinQuote, "Attempt 1 - ISIN Direct EUR");
    }
    if (isinQuote && (!quote || quote.currency !== 'EUR')) { // Prioritize ISIN quote if current stored one isn't EUR
        quote = isinQuote;
    }
    console.log(`[getPriceForIsin] Attempt 1: ${isin} - P=${isinQuote?.regularMarketPrice} C=${isinQuote?.currency}. Storing and falling back.`);
  } catch (error) {
    console.warn(`[getPriceForIsin] Attempt 1: Error for ISIN ${isin}: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Attempt 2: Search by ISIN
  try {
    console.log(`[getPriceForIsin] Attempt 2: Searching by ISIN ${isin}`);
    const searchResults = await yahooFinance.search(isin);
    if (searchResults.quotes && searchResults.quotes.length > 0) {
      let bestMatch = 
        searchResults.quotes.find(q => q.isin === isin && q.currency === 'EUR' && euronextExchangeCodes.includes(q.exchange?.toUpperCase() || '')) ||
        searchResults.quotes.find(q => q.isin === isin && q.currency === 'EUR') ||
        (preferredTicker && searchResults.quotes.find(q => q.symbol === preferredTicker && q.isin === isin && q.currency === 'EUR')) ||
        searchResults.quotes.find(q => q.isin === isin && q.regularMarketPrice && q.currency); // A match with price and currency, even if not EUR

      if (!bestMatch && !preferredTicker) { // Last resort if no preferred ticker
          bestMatch = searchResults.quotes.find(q => q.isin === isin);
      }

      if (bestMatch?.symbol) {
        console.log(`[getPriceForIsin] Attempt 2: Best match symbol ${bestMatch.symbol}. Fetching quote.`);
        const searchDerivedQuote = await yahooFinance.quote(bestMatch.symbol, { fields: fieldsToFetch });
        if (searchDerivedQuote?.regularMarketPrice !== undefined && searchDerivedQuote.currency === 'EUR') {
          console.log(`[getPriceForIsin] Attempt 2: EUR price found for searched symbol ${bestMatch.symbol}.`);
          return extractQuoteData(searchDerivedQuote, "Attempt 2 - Search Derived EUR");
        }
        if (searchDerivedQuote && (!quote || quote.currency !== 'EUR')) { // Prioritize search quote if current stored one isn't EUR
            quote = searchDerivedQuote;
        }
         console.log(`[getPriceForIsin] Attempt 2: Searched ${bestMatch.symbol} - P=${searchDerivedQuote?.regularMarketPrice} C=${searchDerivedQuote?.currency}.`);
      } else {
        console.log(`[getPriceForIsin] Attempt 2: No suitable match with symbol found in search results for ISIN ${isin}.`);
      }
    } else {
      console.log(`[getPriceForIsin] Attempt 2: No quotes in search results for ISIN ${isin}.`);
    }
  } catch (error) {
    console.error(`[getPriceForIsin] Attempt 2: Error during search for ISIN ${isin}: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Fallback to the stored quote if it exists and is EUR, otherwise no price
  if (quote?.regularMarketPrice !== undefined && quote.currency === 'EUR') {
    console.log(`[getPriceForIsin] Fallback: Using stored EUR quote for ${quote.symbol || isin}.`);
    return extractQuoteData(quote, "Fallback EUR");
  }

  console.warn(`[getPriceForIsin] No EUR price found for ISIN ${isin} after all attempts. Current stored quote (if any): P=${quote?.regularMarketPrice}, C=${quote?.currency}`);
  // Return with no price if no EUR price was found
  const returnData: StockPriceData = {
    id,
    isin,
    currentPrice: undefined,
    currency: undefined, // Explicitly undefined
    symbol: quote?.symbol || preferredTicker, // Keep symbol if available
    exchange: quote?.exchange,
    // Keep other details if `quote` has them, even if price is not EUR (they might be useful for display)
    regularMarketChange: quote?.regularMarketChange,
    regularMarketChangePercent: quote?.regularMarketChangePercent,
    regularMarketVolume: quote?.regularMarketVolume,
    averageDailyVolume10Day: quote?.averageDailyVolume10Day || quote?.averageDailyVolume3Month,
    marketCap: quote?.marketCap,
    trailingPE: quote?.trailingPE,
    epsTrailingTwelveMonths: quote?.epsTrailingTwelveMonths,
    fiftyTwoWeekLow: quote?.fiftyTwoWeekLow,
    fiftyTwoWeekHigh: quote?.fiftyTwoWeekHigh,
    ter: quote?.fundProfile?.annualReportExpenseRatio?.raw,
    fundSize: quote?.fundProfile?.totalAssets?.raw ?? quote?.summaryDetail?.totalAssets?.raw,
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
    // Filter out nulls, though getPriceForIsin should always return an object
    return results.filter(r => r !== null) as StockPriceData[];
  }
);
