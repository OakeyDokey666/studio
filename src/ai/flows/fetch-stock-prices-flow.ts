
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
// Attempt to import Quote and QuoteFields from the main module first
import type { Quote, QuoteFields, QuoteResponseArray } from 'yahoo-finance2';

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

const fieldsToFetch: QuoteFields[] = [
  'regularMarketPrice', 'currency', 'symbol', 'exchange',
  'regularMarketVolume', 'averageDailyVolume10Day', 'marketCap',
  'trailingPE', 'epsTrailingTwelveMonths', 'fiftyTwoWeekLow', 'fiftyTwoWeekHigh',
  'regularMarketChange', 'regularMarketChangePercent',
  'fundProfile', // For TER, AUM (totalAssets), categoryName
  'summaryDetail', // Fallback for TER (expenseRatio), AUM (totalAssets)
  // 'price' contains marketCap, no need to explicitly add if already in summaryDetail or fundProfile
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
    avgVolume: quote.averageDailyVolume10Day,
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
  let finalQuoteForExtraction: Quote | undefined = undefined;

  // Attempt 0: Preferred Ticker
  if (preferredTicker) {
    try {
      console.log(`[getPriceForIsin] Attempt 0: Fetching preferred ticker ${preferredTicker}`);
      const quote = await yahooFinance.quote(preferredTicker, { fields: fieldsToFetch });
      console.log(`[getPriceForIsin] Attempt 0: ${preferredTicker} quote received:`, { price: quote?.regularMarketPrice, currency: quote?.currency, symbol: quote?.symbol, exchange: quote?.exchange });
      if (quote?.regularMarketPrice !== undefined && quote.currency?.toUpperCase() === 'EUR') {
        console.log(`[getPriceForIsin] Attempt 0: EUR price found for ${preferredTicker}.`);
        finalQuoteForExtraction = quote;
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
        finalQuoteForExtraction = quote;
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
        // A search result item ('q') is not a full Quote object.
        // We need to find a promising symbol from search, then fetch its full quote.
        const foundSearchQuote = searchResults.quotes.find(q => {
           // Heuristic: Check if symbol ends with .PA (Paris) or .DE (Germany) or other EUR exchanges
           // or if exchDisp contains 'EUR' or known european exchanges.
           // ISIN matching is good, but we primarily need its symbol to fetch a full quote.
          const symbol = q.symbol;
          const exchangeDisplay = q.exchDisp?.toUpperCase();
          return q.isin === isin && symbol && 
                 (symbol.endsWith('.PA') || symbol.endsWith('.DE') || symbol.endsWith('.MI') || symbol.endsWith('.AS') || symbol.endsWith('.MC') ||
                  exchangeDisplay?.includes('EURONEXT') || exchangeDisplay?.includes('XETRA') || exchangeDisplay?.includes('PARIS') || q.currency?.toUpperCase() === 'EUR');
        });

        if (foundSearchQuote?.symbol) {
          console.log(`[getPriceForIsin] Attempt 2: Found potential EUR match in search: ${foundSearchQuote.symbol} (ISIN in search: ${foundSearchQuote.isin}, Currency in search: ${foundSearchQuote.currency}). Fetching its full quote.`);
          const quoteFromSearchSymbol = await yahooFinance.quote(foundSearchQuote.symbol, { fields: fieldsToFetch });
          console.log(`[getPriceForIsin] Attempt 2: Full quote for ${foundSearchQuote.symbol} received:`, { price: quoteFromSearchSymbol?.regularMarketPrice, currency: quoteFromSearchSymbol?.currency, symbol: quoteFromSearchSymbol?.symbol, exchange: quoteFromSearchSymbol?.exchange });
          if (quoteFromSearchSymbol?.regularMarketPrice !== undefined && quoteFromSearchSymbol.currency?.toUpperCase() === 'EUR') {
            console.log(`[getPriceForIsin] Attempt 2: EUR price confirmed for searched symbol ${foundSearchQuote.symbol}.`);
            finalQuoteForExtraction = quoteFromSearchSymbol;
            eurPriceFound = true;
          } else {
             console.log(`[getPriceForIsin] Attempt 2: Searched ${foundSearchQuote.symbol} - Full quote not EUR or incomplete. Price: ${quoteFromSearchSymbol?.regularMarketPrice}, Currency: ${quoteFromSearchSymbol?.currency}`);
          }
        } else {
          console.log(`[getPriceForIsin] Attempt 2: No promising EUR-likely symbol found in search results for ISIN ${isin}. Search results:`, searchResults.quotes.map(q=> ({symbol: q.symbol, isin: q.isin, currency: q.currency, name: q.shortname, exchange: q.exchDisp })));
        }
      } else {
        console.log(`[getPriceForIsin] Attempt 2: No quotes in search results for ISIN ${isin}.`);
      }
    } catch (error) {
      console.error(`[getPriceForIsin] Attempt 2: Error during search for ISIN ${isin}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (eurPriceFound && finalQuoteForExtraction) {
    resultData = extractDataFromQuote(finalQuoteForExtraction, isin, id);
  } else {
    console.warn(`[getPriceForIsin] No EUR price found for ISIN ${isin} (ID: ${id}) after all attempts. Returning with no price.`);
    resultData = { // Ensure a clean structure for "not found"
        id,
        isin,
        currentPrice: undefined,
        currency: undefined,
        symbol: preferredTicker, // Keep preferred ticker if available, for context
    };
  }

  console.log(`[getPriceForIsin] Final data for ISIN ${isin} (ID: ${id}):`, resultData);
  return resultData as StockPriceData;
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
    return results.filter(r => r !== null) as FetchStockPricesOutput;
  }
);

