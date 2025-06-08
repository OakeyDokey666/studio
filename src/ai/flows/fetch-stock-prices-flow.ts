
'use server';
/**
 * @fileOverview Fetches latest stock prices and related financial data using Yahoo Finance.
 *
 * - fetchStockPrices - A function that takes ISINs (and optional tickers) and returns current prices and other details.
 * - FetchStockPricesInput - The input type for the fetchStockPrices function.
 * - FetchStockPricesOutput - The return type for the fetchStockPrices function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import yahooFinance from 'yahoo-finance2';
import type { Quote, QuoteFields } from 'yahoo-finance2/dist/esm/src/modules/quote';

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
  currentPrice: z.number().optional().describe('The latest market price in EUR.'),
  currency: z.string().optional().describe('The currency of the price found.'),
  symbol: z.string().optional().describe('The ticker symbol found on Yahoo Finance.'),
  exchange: z.string().optional().describe('The exchange the price was sourced from.'),
  // For Price Popover
  volume: z.number().optional().describe('Current trading volume.'),
  avgVolume: z.number().optional().describe('Average daily trading volume (10-day or other period).'),
  marketCap: z.number().optional().describe("The total market value of a company's outstanding shares."),
  peRatio: z.number().optional().describe('Price-to-Earnings ratio.'),
  eps: z.number().optional().describe('Earnings Per Share.'),
  fiftyTwoWeekLow: z.number().optional().describe('Lowest price over the past 52 weeks.'),
  fiftyTwoWeekHigh: z.number().optional().describe('Highest price over the past 52 weeks.'),
  // For Day Change
  regularMarketChange: z.number().optional().describe("The day's change in price."),
  regularMarketChangePercent: z.number().optional().describe("The day's percentage change in price."),
  // For Name Popover (ETF specific)
  ter: z.number().optional().describe('Total Expense Ratio for ETFs.'),
  fundSize: z.number().optional().describe('Fund size (AUM) for ETFs.'),
  categoryName: z.string().optional().describe('Fund category for ETFs.'),
});
export type StockPriceData = z.infer<typeof StockPriceDataSchema>;

const FetchStockPricesOutputSchema = z.array(StockPriceDataSchema).describe('An array of stock price data for the requested assets.');
export type FetchStockPricesOutput = z.infer<typeof FetchStockPricesOutputSchema>;

// Define the fields to fetch from Yahoo Finance
// These are known valid keys for the 'fields' option in yahoo-finance2's quote function.
const fieldsToFetch: QuoteFields[] = [
  'regularMarketPrice', 'currency', 'symbol', 'exchange',
  'regularMarketVolume', 'averageDailyVolume10Day', 'marketCap',
  'trailingPE', 'epsTrailingTwelveMonths', 'fiftyTwoWeekLow', 'fiftyTwoWeekHigh',
  'regularMarketChange', 'regularMarketChangePercent',
  // Parent objects that contain some of the desired nested data (like TER, Fund Size)
  'fundProfile', 'summaryDetail', 'price' // price contains marketCap as well
];

function extractDataFromQuote(quote: Quote | undefined, isin: string, id: string): Partial<StockPriceData> {
  if (!quote) return { id, isin };

  const data: Partial<StockPriceData> = {
    id,
    isin,
    currentPrice: quote.regularMarketPrice,
    currency: quote.currency,
    symbol: quote.symbol,
    exchange: quote.exchange,
    // Price Popover
    volume: quote.regularMarketVolume,
    avgVolume: quote.averageDailyVolume10Day, // or averageDailyVolume3Month if preferred
    marketCap: quote.marketCap,
    peRatio: quote.trailingPE,
    eps: quote.epsTrailingTwelveMonths,
    fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
    fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
    // Day Change
    regularMarketChange: quote.regularMarketChange,
    regularMarketChangePercent: quote.regularMarketChangePercent,
    // Name Popover (ETF Specific)
    ter: quote.fundProfile?.annualReportExpenseRatio?.raw ?? quote.summaryDetail?.expenseRatio?.raw,
    fundSize: quote.fundProfile?.totalAssets?.raw ?? quote.summaryDetail?.totalAssets?.raw,
    categoryName: quote.fundProfile?.categoryName,
  };
  return data;
}


async function getPriceForIsin(isin: string, id: string, preferredTicker?: string): Promise<StockPriceData> {
  console.log(`\n[getPriceForIsin] Processing ISIN: ${isin}, ID: ${id}, Ticker: ${preferredTicker}`);

  let resultData: Partial<StockPriceData> = { id, isin };
  let eurPriceFound = false;

  // Attempt 0: Preferred Ticker
  if (preferredTicker) {
    try {
      console.log(`[getPriceForIsin] Attempt 0: Fetching preferred ticker ${preferredTicker}`);
      const quote = await yahooFinance.quote(preferredTicker, { fields: fieldsToFetch });
      console.log(`[getPriceForIsin] Attempt 0: ${preferredTicker} quote received:`, { price: quote?.regularMarketPrice, currency: quote?.currency, symbol: quote?.symbol, exchange: quote?.exchange });
      if (quote?.regularMarketPrice !== undefined && quote.currency?.toUpperCase() === 'EUR') {
        console.log(`[getPriceForIsin] Attempt 0: EUR price found for ${preferredTicker}.`);
        resultData = extractDataFromQuote(quote, isin, id);
        eurPriceFound = true;
      } else {
        console.log(`[getPriceForIsin] Attempt 0: ${preferredTicker} - Not EUR or incomplete. Price: ${quote?.regularMarketPrice}, Currency: ${quote?.currency}`);
      }
    } catch (error) {
      console.error(`[getPriceForIsin] Attempt 0: Error for ${preferredTicker}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Attempt 1: ISIN as Symbol (if EUR price not found yet)
  if (!eurPriceFound) {
    try {
      console.log(`[getPriceForIsin] Attempt 1: Fetching ISIN as symbol ${isin}`);
      const quote = await yahooFinance.quote(isin, { fields: fieldsToFetch });
      console.log(`[getPriceForIsin] Attempt 1: ${isin} quote received:`, { price: quote?.regularMarketPrice, currency: quote?.currency, symbol: quote?.symbol, exchange: quote?.exchange });
      if (quote?.regularMarketPrice !== undefined && quote.currency?.toUpperCase() === 'EUR') {
        console.log(`[getPriceForIsin] Attempt 1: EUR price found for ISIN ${isin}.`);
        resultData = extractDataFromQuote(quote, isin, id);
        eurPriceFound = true;
      } else {
        console.log(`[getPriceForIsin] Attempt 1: ${isin} - Not EUR or incomplete. Price: ${quote?.regularMarketPrice}, Currency: ${quote?.currency}`);
      }
    } catch (error) {
      console.warn(`[getPriceForIsin] Attempt 1: Error for ISIN ${isin}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Attempt 2: Search by ISIN (if EUR price not found yet)
  if (!eurPriceFound) {
    try {
      console.log(`[getPriceForIsin] Attempt 2: Searching by ISIN ${isin}`);
      const searchResults = await yahooFinance.search(isin);
      if (searchResults.quotes && searchResults.quotes.length > 0) {
        const eurQuoteFromSearch = searchResults.quotes.find(q => q.isin === isin && q.currency?.toUpperCase() === 'EUR' && q.symbol);

        if (eurQuoteFromSearch?.symbol) {
          console.log(`[getPriceForIsin] Attempt 2: Found potential EUR match in search: ${eurQuoteFromSearch.symbol}. Fetching its quote.`);
          const quote = await yahooFinance.quote(eurQuoteFromSearch.symbol, { fields: fieldsToFetch });
          console.log(`[getPriceForIsin] Attempt 2: ${eurQuoteFromSearch.symbol} quote received:`, { price: quote?.regularMarketPrice, currency: quote?.currency, symbol: quote?.symbol, exchange: quote?.exchange });
          if (quote?.regularMarketPrice !== undefined && quote.currency?.toUpperCase() === 'EUR') {
            console.log(`[getPriceForIsin] Attempt 2: EUR price found for searched symbol ${eurQuoteFromSearch.symbol}.`);
            resultData = extractDataFromQuote(quote, isin, id);
            eurPriceFound = true;
          } else {
             console.log(`[getPriceForIsin] Attempt 2: Searched ${eurQuoteFromSearch.symbol} - Not EUR or incomplete after fetching. Price: ${quote?.regularMarketPrice}, Currency: ${quote?.currency}`);
          }
        } else {
          console.log(`[getPriceForIsin] Attempt 2: No direct EUR match with symbol in search results for ISIN ${isin}. Possible results:`, searchResults.quotes.map(q=> ({symbol: q.symbol, isin: q.isin, currency: q.currency, name: q.shortname})));
        }
      } else {
        console.log(`[getPriceForIsin] Attempt 2: No quotes in search results for ISIN ${isin}.`);
      }
    } catch (error) {
      console.error(`[getPriceForIsin] Attempt 2: Error during search for ISIN ${isin}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!eurPriceFound) {
    console.warn(`[getPriceForIsin] No EUR price found for ISIN ${isin} after all attempts. Returning with potentially no price.`);
    // Ensure currentPrice is undefined if not explicitly set to a EUR price
    return {
        id,
        isin,
        currentPrice: undefined,
        currency: undefined,
        symbol: preferredTicker, // Keep preferred ticker if available, for context
        // Other fields will be undefined by default
    } as StockPriceData; // Cast to ensure all required fields are at least undefined if not set
  }

  console.log(`[getPriceForIsin] Final data for ISIN ${isin}:`, resultData);
  return resultData as StockPriceData; // Cast as we've built it piece by piece
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
    console.log("[fetchStockPricesFlow] Results from getPriceForIsin:", results);
    return results.filter(r => r !== null) as FetchStockPricesOutput; // Filter out any potential nulls
  }
);
