
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
import type { Quote, QuoteFields } from 'yahoo-finance2/dist/esm/src/modules/quote.js';

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
  // For Name Popover (ETF specific)
  ter: z.number().optional().describe('Total Expense Ratio for ETFs.'),
  fundSize: z.number().optional().describe('Fund size (AUM) for ETFs.'),
  categoryName: z.string().optional().describe('Fund category for ETFs.'),
});
export type StockPriceData = z.infer<typeof StockPriceDataSchema>;

const FetchStockPricesOutputSchema = z.array(StockPriceDataSchema);
export type FetchStockPricesOutput = z.infer<typeof FetchStockPricesOutputSchema>;

// Fields for basic price, name popover, and attempting to get other details
const fieldsToFetch: QuoteFields[] = [
  'regularMarketPrice', 'currency', 'symbol', 'exchange',
  'fundProfile', // For TER (annualReportExpenseRatio.raw), AUM (totalAssets.raw), categoryName
  'summaryDetail', // Fallback for TER (expenseRatio.raw), AUM (totalAssets.raw)
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
    // Name Popover (ETF Specific)
    ter: quote.fundProfile?.annualReportExpenseRatio?.raw ?? quote.summaryDetail?.expenseRatio?.raw,
    fundSize: quote.fundProfile?.totalAssets?.raw ?? quote.summaryDetail?.totalAssets?.raw,
    categoryName: quote.fundProfile?.categoryName,
  };
  return data;
}

async function getPriceForIsin(isin: string, id: string, preferredTicker?: string): Promise<StockPriceData> {
  console.log(`[getPriceForIsin RB] Processing ISIN: ${isin}, ID: ${id}, Ticker: ${preferredTicker}`);

  let finalQuoteForExtraction: Quote | undefined = undefined;
  let eurPriceFound = false;

  // Attempt 0: Preferred Ticker
  if (preferredTicker) {
    try {
      console.log(`[getPriceForIsin RB] Attempt 0: Fetching preferred ticker ${preferredTicker}`);
      const quote = await yahooFinance.quote(preferredTicker, { fields: fieldsToFetch });
      console.log(`[getPriceForIsin RB] Attempt 0: ${preferredTicker} quote received:`, { price: quote?.regularMarketPrice, currency: quote?.currency, symbol: quote?.symbol, exchange: quote?.exchange });
      if (quote?.regularMarketPrice !== undefined && quote.currency?.toUpperCase() === 'EUR') {
        console.log(`[getPriceForIsin RB] Attempt 0: EUR price found for ${preferredTicker}.`);
        finalQuoteForExtraction = quote;
        eurPriceFound = true;
      } else {
        finalQuoteForExtraction = quote; // Keep it for potential non-EUR details if no EUR price is found later
        console.log(`[getPriceForIsin RB] Attempt 0: ${preferredTicker} - Not EUR or incomplete. Price: ${quote?.regularMarketPrice}, Currency: ${quote?.currency}`);
      }
    } catch (error) {
      console.error(`[getPriceForIsin RB] Attempt 0: Error for ${preferredTicker}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Attempt 1: ISIN as Symbol (if EUR price not found yet)
  if (!eurPriceFound) {
    try {
      console.log(`[getPriceForIsin RB] Attempt 1: Fetching ISIN as symbol ${isin}`);
      const quote = await yahooFinance.quote(isin, { fields: fieldsToFetch });
      console.log(`[getPriceForIsin RB] Attempt 1: ${isin} quote received:`, { price: quote?.regularMarketPrice, currency: quote?.currency, symbol: quote?.symbol, exchange: quote?.exchange });
      if (quote?.regularMarketPrice !== undefined && quote.currency?.toUpperCase() === 'EUR') {
        console.log(`[getPriceForIsin RB] Attempt 1: EUR price found for ISIN ${isin}.`);
        finalQuoteForExtraction = quote;
        eurPriceFound = true;
      } else if (!finalQuoteForExtraction) { // Only store if we don't have one from attempt 0
        finalQuoteForExtraction = quote;
        console.log(`[getPriceForIsin RB] Attempt 1: ${isin} - Not EUR or incomplete. Price: ${quote?.regularMarketPrice}, Currency: ${quote?.currency}`);
      }
    } catch (error) {
      console.warn(`[getPriceForIsin RB] Attempt 1: Error for ISIN ${isin}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Attempt 2: Search by ISIN (if EUR price not found yet)
  if (!eurPriceFound) {
    try {
      console.log(`[getPriceForIsin RB] Attempt 2: Searching by ISIN ${isin}`);
      const searchResults = await yahooFinance.search(isin);
      if (searchResults.quotes && searchResults.quotes.length > 0) {
        const foundSearchQuote = searchResults.quotes.find(q => {
          const symbol = q.symbol;
          const exchangeDisplay = q.exchDisp?.toUpperCase();
          return q.isin === isin && symbol &&
                 (symbol.endsWith('.PA') || symbol.endsWith('.DE') || symbol.endsWith('.MI') || symbol.endsWith('.AS') || symbol.endsWith('.MC') ||
                  exchangeDisplay?.includes('EURONEXT') || exchangeDisplay?.includes('XETRA') || exchangeDisplay?.includes('PARIS') || (q as any).currency?.toUpperCase() === 'EUR');
        });

        if (foundSearchQuote?.symbol) {
          console.log(`[getPriceForIsin RB] Attempt 2: Found potential EUR match in search: ${foundSearchQuote.symbol} (ISIN in search: ${foundSearchQuote.isin}, Currency in search: ${(foundSearchQuote as any).currency}). Fetching its full quote.`);
          const quoteFromSearchSymbol = await yahooFinance.quote(foundSearchQuote.symbol, { fields: fieldsToFetch });
          console.log(`[getPriceForIsin RB] Attempt 2: Full quote for ${foundSearchQuote.symbol} received:`, { price: quoteFromSearchSymbol?.regularMarketPrice, currency: quoteFromSearchSymbol?.currency, symbol: quoteFromSearchSymbol?.symbol, exchange: quoteFromSearchSymbol?.exchange });
          if (quoteFromSearchSymbol?.regularMarketPrice !== undefined && quoteFromSearchSymbol.currency?.toUpperCase() === 'EUR') {
            console.log(`[getPriceForIsin RB] Attempt 2: EUR price confirmed for searched symbol ${foundSearchQuote.symbol}.`);
            finalQuoteForExtraction = quoteFromSearchSymbol;
            eurPriceFound = true;
          } else {
             if (!finalQuoteForExtraction) { // Only store if we don't have one from previous attempts
                finalQuoteForExtraction = quoteFromSearchSymbol;
             }
             console.log(`[getPriceForIsin RB] Attempt 2: Searched ${foundSearchQuote.symbol} - Full quote not EUR or incomplete. Price: ${quoteFromSearchSymbol?.regularMarketPrice}, Currency: ${quoteFromSearchSymbol?.currency}`);
          }
        } else {
          console.log(`[getPriceForIsin RB] Attempt 2: No promising EUR-likely symbol found in search results for ISIN ${isin}. Search results:`, searchResults.quotes.map(q=> ({symbol: q.symbol, isin: q.isin, currency: (q as any).currency, name: q.shortname, exchange: q.exchDisp })));
        }
      } else {
        console.log(`[getPriceForIsin RB] Attempt 2: No quotes in search results for ISIN ${isin}.`);
      }
    } catch (error) {
      console.error(`[getPriceForIsin RB] Attempt 2: Error during search for ISIN ${isin}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  let resultData: Partial<StockPriceData> = { id, isin };
  if (finalQuoteForExtraction) {
    resultData = extractDataFromQuote(finalQuoteForExtraction, isin, id);
    if (!eurPriceFound || finalQuoteForExtraction.currency?.toUpperCase() !== 'EUR') {
        // If a quote was found but it wasn't EUR, ensure price is undefined.
        // Keep other details like TER/AUM if they were fetched.
        console.warn(`[getPriceForIsin RB] Final quote for ${isin} (ID: ${id}) was not in EUR (Currency: ${finalQuoteForExtraction.currency}). Clearing price.`);
        resultData.currentPrice = undefined;
        resultData.currency = finalQuoteForExtraction.currency; // Report the actual currency found
    } else {
        // EUR price was found and set by extractDataFromQuote
        console.log(`[getPriceForIsin RB] EUR price successfully extracted for ${isin} (ID: ${id}): ${resultData.currentPrice}`);
    }
  } else {
    console.warn(`[getPriceForIsin RB] No quote found for ISIN ${isin} (ID: ${id}) after all attempts. Returning with no price or details.`);
    // Ensure a clean structure for "not found"
    resultData = {
        id,
        isin,
        currentPrice: undefined,
        currency: undefined,
        symbol: preferredTicker, // Keep preferred ticker if available, for context
        ter: undefined,
        fundSize: undefined,
        categoryName: undefined,
    };
  }

  console.log(`[getPriceForIsin RB] Final data for ISIN ${isin} (ID: ${id}):`, resultData);
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
    console.log("[fetchStockPricesFlow RB] Starting flow for assets:", assets);
    const pricePromises = assets.map(asset => getPriceForIsin(asset.isin, asset.id, asset.ticker));
    const results = await Promise.all(pricePromises);
    console.log("[fetchStockPricesFlow RB] Results from getPriceForIsin:", results);
    return results.filter(r => r !== null) as FetchStockPricesOutput;
  }
);
