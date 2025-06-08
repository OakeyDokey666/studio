
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
  // Fields for price popover
  regularMarketVolume: z.number().optional().describe('Current trading volume.'),
  averageDailyVolume10Day: z.number().optional().describe('Average daily trading volume over 10 days.'),
  marketCap: z.number().optional().describe('Market capitalization.'),
  trailingPE: z.number().optional().describe('Trailing Price-to-Earnings ratio.'),
  epsTrailingTwelveMonths: z.number().optional().describe('Earnings Per Share over the trailing twelve months.'),
  fiftyTwoWeekLow: z.number().optional().describe('The lowest price in the past 52 weeks.'),
  fiftyTwoWeekHigh: z.number().optional().describe('The highest price in the past 52 weeks.'),
  // Fields for name popover (ETF details)
  ter: z.number().optional().describe('Total Expense Ratio (annual) from fundProfile.annualReportExpenseRatio.raw.'),
  fundSize: z.number().optional().describe('Fund Size / Assets Under Management (AUM) from fundProfile.totalAssets.raw or summaryDetail.totalAssets.raw.'),
  categoryName: z.string().optional().describe('Fund category from fundProfile.categoryName'),
});
export type StockPriceData = z.infer<typeof StockPriceDataSchema>;

const FetchStockPricesOutputSchema = z.array(StockPriceDataSchema).describe('An array of stock price data for the requested assets.');
export type FetchStockPricesOutput = z.infer<typeof FetchStockPricesOutputSchema>;


async function getPriceForIsin(isin: string, id: string, preferredTicker?: string): Promise<StockPriceData> {
  console.log(`\n[getPriceForIsin] Processing ISIN: ${isin}, ID: ${id}, Ticker: ${preferredTicker}`);
  let quote: any; // Store the most promising quote found
  const euronextExchangeCodes = ['PAR', 'AMS', 'BRU', 'LIS', 'DUB', 'MCE', 'OSL']; // Euronext exchanges
  const fieldsToFetch = ['price', 'summaryDetail', 'summaryProfile', 'fundProfile', 'defaultKeyStatistics', 'financialData'];

  const extractQuoteData = (q: any, attemptName: string): StockPriceData => {
    const price = q.regularMarketPrice;
    const curr = q.currency;
    console.log(`[getPriceForIsin - ${attemptName}] Attempting to extract from quote: P=${price} C=${curr} S=${q.symbol} E=${q.exchange}`);
    
    if (price !== undefined && curr && curr.toUpperCase() === 'EUR') {
      console.log(`[getPriceForIsin - ${attemptName}] EUR price found: ${price}. Extracting details.`);
      return {
        id,
        isin,
        currentPrice: price,
        currency: curr,
        symbol: q.symbol || preferredTicker,
        exchange: q.exchange,
        regularMarketVolume: q.regularMarketVolume,
        averageDailyVolume10Day: q.averageDailyVolume10Day || q.averageDailyVolume3Month,
        marketCap: q.marketCap,
        trailingPE: q.trailingPE,
        epsTrailingTwelveMonths: q.epsTrailingTwelveMonths,
        fiftyTwoWeekLow: q.fiftyTwoWeekLow,
        fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
        ter: q.fundProfile?.annualReportExpenseRatio?.raw,
        fundSize: q.fundProfile?.totalAssets?.raw ?? q.summaryDetail?.totalAssets?.raw,
        categoryName: q.fundProfile?.categoryName,
      };
    }
    console.log(`[getPriceForIsin - ${attemptName}] Non-EUR or incomplete quote. P=${price}, C=${curr}`);
    return { // Return structure even if no valid EUR price
      id,
      isin,
      currentPrice: undefined,
      currency: curr, // Keep currency to know what was found
      symbol: q.symbol || preferredTicker,
      exchange: q.exchange,
      // Populate other details if available, even if price is not EUR
      regularMarketVolume: q.regularMarketVolume,
      averageDailyVolume10Day: q.averageDailyVolume10Day || q.averageDailyVolume3Month,
      marketCap: q.marketCap,
      trailingPE: q.trailingPE,
      epsTrailingTwelveMonths: q.epsTrailingTwelveMonths,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
      ter: q.fundProfile?.annualReportExpenseRatio?.raw,
      fundSize: q.fundProfile?.totalAssets?.raw ?? q.summaryDetail?.totalAssets?.raw,
      categoryName: q.fundProfile?.categoryName,
    };
  };

  // Attempt 0: Preferred Ticker
  if (preferredTicker) {
    try {
      console.log(`[getPriceForIsin] Attempt 0: Fetching preferred ticker ${preferredTicker}`);
      const preferredQuote = await yahooFinance.quote(preferredTicker, { fields: fieldsToFetch });
      if (preferredQuote?.regularMarketPrice !== undefined && preferredQuote.currency?.toUpperCase() === 'EUR') {
        console.log(`[getPriceForIsin] Attempt 0: EUR price found for ${preferredTicker}.`);
        return extractQuoteData(preferredQuote, "Attempt 0 - Preferred Ticker EUR");
      }
      if (preferredQuote) quote = preferredQuote; // Store if non-EUR, to potentially use its symbol/exchange later
      console.log(`[getPriceForIsin] Attempt 0: ${preferredTicker} - P=${preferredQuote?.regularMarketPrice} C=${preferredQuote?.currency}. Storing and falling back.`);
    } catch (error) {
      console.error(`[getPriceForIsin] Attempt 0: Error for ${preferredTicker}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Attempt 1: ISIN as Symbol
  try {
    console.log(`[getPriceForIsin] Attempt 1: Fetching ISIN as symbol ${isin}`);
    const isinQuote = await yahooFinance.quote(isin, { fields: fieldsToFetch });
    if (isinQuote?.regularMarketPrice !== undefined && isinQuote.currency?.toUpperCase() === 'EUR') {
      console.log(`[getPriceForIsin] Attempt 1: EUR price found for ISIN ${isin}.`);
      return extractQuoteData(isinQuote, "Attempt 1 - ISIN Direct EUR");
    }
    // Prioritize ISIN quote if current stored one (from preferredTicker) isn't EUR or doesn't exist
    if (isinQuote && (!quote || quote.currency?.toUpperCase() !== 'EUR')) {
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
      // Try to find a EUR quote, preferring Euronext, then any EUR, then preferred ticker if it's EUR
      let bestMatch =
        searchResults.quotes.find(q => q.isin === isin && q.currency?.toUpperCase() === 'EUR' && euronextExchangeCodes.includes(q.exchange?.toUpperCase() || '')) ||
        searchResults.quotes.find(q => q.isin === isin && q.currency?.toUpperCase() === 'EUR') ||
        (preferredTicker && searchResults.quotes.find(q => q.symbol === preferredTicker && q.isin === isin && q.currency?.toUpperCase() === 'EUR'));

      if (bestMatch?.symbol) {
        console.log(`[getPriceForIsin] Attempt 2: Found potential match symbol ${bestMatch.symbol} for ISIN ${isin}. Fetching its quote.`);
        const searchDerivedQuote = await yahooFinance.quote(bestMatch.symbol, { fields: fieldsToFetch });
        if (searchDerivedQuote?.regularMarketPrice !== undefined && searchDerivedQuote.currency?.toUpperCase() === 'EUR') {
          console.log(`[getPriceForIsin] Attempt 2: EUR price found for searched symbol ${bestMatch.symbol}.`);
          return extractQuoteData(searchDerivedQuote, "Attempt 2 - Search Derived EUR");
        }
        // Prioritize search-derived quote if current stored one isn't EUR or doesn't exist
        if (searchDerivedQuote && (!quote || quote.currency?.toUpperCase() !== 'EUR')) {
            quote = searchDerivedQuote;
        }
        console.log(`[getPriceForIsin] Attempt 2: Searched ${bestMatch.symbol} - P=${searchDerivedQuote?.regularMarketPrice} C=${searchDerivedQuote?.currency}.`);
      } else {
        console.log(`[getPriceForIsin] Attempt 2: No suitable EUR match with symbol found in search results for ISIN ${isin}.`);
      }
    } else {
      console.log(`[getPriceForIsin] Attempt 2: No quotes in search results for ISIN ${isin}.`);
    }
  } catch (error) {
    console.error(`[getPriceForIsin] Attempt 2: Error during search for ISIN ${isin}: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Final Check: If 'quote' was populated by a non-EUR attempt but is the only one we have, use its details but no price.
  if (quote) {
    console.log(`[getPriceForIsin] Fallback: Evaluating stored quote for ${quote.symbol || isin}. P=${quote.regularMarketPrice}, C=${quote.currency}`);
    // Extract data but currentPrice will be undefined if not EUR
    const finalExtractedData = extractQuoteData(quote, "Fallback Evaluation");
    if (finalExtractedData.currentPrice !== undefined) { // This means it was EUR
      console.log(`[getPriceForIsin] Fallback: Stored quote was EUR. Using it.`);
      return finalExtractedData;
    }
    console.warn(`[getPriceForIsin] Fallback: Stored quote for ${quote.symbol || isin} was not EUR or incomplete. P=${quote.regularMarketPrice}, C=${quote.currency}`);
    // Return data without price, but with other details if present
     return {
        ...finalExtractedData,
        currentPrice: undefined, // Explicitly ensure price is undefined
        currency: quote.currency, // Reflect the currency of the quote we did find
    };
  }

  console.warn(`[getPriceForIsin] No price found for ISIN ${isin} after all attempts.`);
  return { // Ensure all fields from StockPriceDataSchema are present, even if undefined
    id,
    isin,
    currentPrice: undefined,
    currency: undefined,
    symbol: preferredTicker, // Best guess for symbol
    exchange: undefined,
    regularMarketVolume: undefined,
    averageDailyVolume10Day: undefined,
    marketCap: undefined,
    trailingPE: undefined,
    epsTrailingTwelveMonths: undefined,
    fiftyTwoWeekLow: undefined,
    fiftyTwoWeekHigh: undefined,
    ter: undefined,
    fundSize: undefined,
    categoryName: undefined,
  };
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
    console.log("[fetchStockPricesFlow] Starting flow for assets:", assets);
    const pricePromises = assets.map(asset => getPriceForIsin(asset.isin, asset.id, asset.ticker));
    const results = await Promise.all(pricePromises);
    console.log("[fetchStockPricesFlow] Raw results from getPriceForIsin:", results);
    // Filter out results where currentPrice is undefined AFTER attempting to get other details.
    // The main app will handle displaying N/A based on this.
    // No, the flow should return all results, the app will decide.
    // We are just ensuring the structure matches StockPriceData.
    return results;
  }
);

