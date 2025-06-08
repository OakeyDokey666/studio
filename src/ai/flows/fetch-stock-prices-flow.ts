
'use server';
/**
 * @fileOverview Fetches latest stock prices and related financial data using Yahoo Finance.
 * This version focuses on reliability and re-introducing Name Popover details.
 *
 * - fetchStockPrices - A function that takes ISINs (and optional tickers) and returns current prices and other details.
 * - FetchStockPricesInput - The input type for the fetchStockPrices function.
 * - FetchStockPricesOutput - The return type for the fetchStockPrices function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import yahooFinance from 'yahoo-finance2';
// Using .js extension as it's often required for ESM modules by Node/TS, and ensuring correct type import
import type { Quote, QuoteNodeQueryOptions } from 'yahoo-finance2/dist/esm/src/modules/quote.js';


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
  // For Name Popover
  ter: z.number().optional().describe('Total Expense Ratio for ETFs.'),
  fundSize: z.number().optional().describe('Fund size (AUM) for ETFs.'),
  categoryName: z.string().optional().describe('Fund category for ETFs.'),
  // For Day Change
  regularMarketChange: z.number().optional().describe('The change in market price since the previous close.'),
  regularMarketChangePercent: z.number().optional().describe('The percentage change in market price since the previous close.'),
  regularMarketPreviousClose: z.number().optional().describe('The previous closing price of the asset.'),
  debugLogs: z.array(z.string()).optional().describe('Debug logs for price fetching process.'),
});
export type StockPriceData = z.infer<typeof StockPriceDataSchema>;

const FetchStockPricesOutputSchema = z.array(StockPriceDataSchema);
export type FetchStockPricesOutput = z.infer<typeof FetchStockPricesOutputSchema>;


const queryOptions: QuoteNodeQueryOptions = {
  modules: ['price', 'fundProfile', 'summaryDetail'],
};


function extractDataFromQuote(quote: Quote | undefined, isin: string, id: string, debugLogs: string[]): Partial<StockPriceData> {
  if (!quote) {
    debugLogs.push('extractDataFromQuote: No quote object provided.');
    return { id, isin };
  }
  debugLogs.push(`extractDataFromQuote: Processing quote for ISIN ${isin}, Symbol ${quote.symbol}`);

  debugLogs.push(`  Raw quote.fundProfile exists: ${quote.fundProfile ? 'Yes' : 'No'}`);
  if (quote.fundProfile) {
    debugLogs.push(`    fundProfile.annualReportExpenseRatio (raw object): ${JSON.stringify(quote.fundProfile.annualReportExpenseRatio)}`);
    debugLogs.push(`    fundProfile.annualReportExpenseRatio?.raw: ${quote.fundProfile.annualReportExpenseRatio?.raw}`);
    debugLogs.push(`    fundProfile.totalAssets (raw object): ${JSON.stringify(quote.fundProfile.totalAssets)}`);
    debugLogs.push(`    fundProfile.totalAssets?.raw: ${quote.fundProfile.totalAssets?.raw}`);
    debugLogs.push(`    fundProfile.categoryName: ${quote.fundProfile.categoryName}`);
  } else {
    debugLogs.push(`    fundProfile details not available.`);
  }

  debugLogs.push(`  Raw quote.summaryDetail exists: ${quote.summaryDetail ? 'Yes' : 'No'}`);
  if (quote.summaryDetail) {
    debugLogs.push(`    summaryDetail.expenseRatio (raw object): ${JSON.stringify(quote.summaryDetail.expenseRatio)}`);
    debugLogs.push(`    summaryDetail.expenseRatio?.raw: ${quote.summaryDetail.expenseRatio?.raw}`);
    debugLogs.push(`    summaryDetail.totalAssets (raw object): ${JSON.stringify(quote.summaryDetail.totalAssets)}`);
    debugLogs.push(`    summaryDetail.totalAssets?.raw: ${quote.summaryDetail.totalAssets?.raw}`);
  } else {
    debugLogs.push(`    summaryDetail details not available.`);
  }
  
  debugLogs.push(`  Raw quote.regularMarketChange: ${quote.regularMarketChange}`);
  debugLogs.push(`  Raw quote.regularMarketChangePercent: ${quote.regularMarketChangePercent}`);
  debugLogs.push(`  Raw quote.regularMarketPreviousClose: ${quote.regularMarketPreviousClose}`);

  const data: Partial<StockPriceData> = {
    id,
    isin,
    currentPrice: quote.regularMarketPrice,
    currency: quote.currency,
    symbol: quote.symbol,
    exchange: quote.exchange,
    ter: quote.fundProfile?.annualReportExpenseRatio?.raw ?? quote.summaryDetail?.expenseRatio?.raw,
    fundSize: quote.fundProfile?.totalAssets?.raw ?? quote.summaryDetail?.totalAssets?.raw,
    categoryName: quote.fundProfile?.categoryName,
    regularMarketChange: quote.regularMarketChange,
    regularMarketChangePercent: quote.regularMarketChangePercent,
    regularMarketPreviousClose: quote.regularMarketPreviousClose,
  };
  debugLogs.push(`extractDataFromQuote: Extracted Price: ${data.currentPrice}, Currency: ${data.currency}, Symbol: ${data.symbol}, Exchange: ${data.exchange}. TER: ${data.ter}, FundSize: ${data.fundSize}, Category: ${data.categoryName}, Change: ${data.regularMarketChange}, Change %: ${data.regularMarketChangePercent}`);
  return data;
}


async function getPriceForIsin(isin: string, id: string, preferredTicker?: string): Promise<StockPriceData> {
  const debugLogs: string[] = [];
  debugLogs.push(`[getPriceForIsin RB] Start: ISIN: ${isin}, ID: ${id}, Ticker: ${preferredTicker}`);

  let finalQuoteForExtraction: Quote | undefined = undefined;
  let eurPriceFound = false;
  
  const modulesToRequest = queryOptions.modules?.join(', ') || 'library defaults';
  debugLogs.push(`  Using queryOptions with modules: ${modulesToRequest}`);

  // Attempt 0: Preferred Ticker
  if (preferredTicker) {
    debugLogs.push(`Attempt 0: Fetching preferred ticker ${preferredTicker} with modules: ${modulesToRequest}`);
    try {
      const quote = await yahooFinance.quote(preferredTicker, {}, queryOptions);
      debugLogs.push(`Attempt 0: ${preferredTicker} quote received - Price: ${quote?.regularMarketPrice}, Currency: ${quote?.currency}, Symbol: ${quote?.symbol}, Exchange: ${quote?.exchange}`);
      if (quote?.regularMarketPrice !== undefined && quote.currency?.toUpperCase() === 'EUR') {
        debugLogs.push(`Attempt 0: EUR price found for ${preferredTicker}.`);
        finalQuoteForExtraction = quote;
        eurPriceFound = true;
      } else {
        finalQuoteForExtraction = quote; 
        debugLogs.push(`Attempt 0: ${preferredTicker} - Not EUR or incomplete. Price: ${quote?.regularMarketPrice}, Currency: ${quote?.currency}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      debugLogs.push(`Attempt 0: Error for ${preferredTicker}: ${errorMsg}`);
      console.error(`[getPriceForIsin RB] Attempt 0: Error for ${preferredTicker}: ${errorMsg}`);
    }
  } else {
    debugLogs.push('Attempt 0: No preferred ticker provided.');
  }

  // Attempt 1: ISIN as Symbol (if EUR price not found yet)
  if (!eurPriceFound) {
    debugLogs.push(`Attempt 1: Fetching ISIN as symbol ${isin} with modules: ${modulesToRequest}`);
    try {
      const quote = await yahooFinance.quote(isin, {}, queryOptions);
      debugLogs.push(`Attempt 1: ${isin} quote received - Price: ${quote?.regularMarketPrice}, Currency: ${quote?.currency}, Symbol: ${quote?.symbol}, Exchange: ${quote?.exchange}`);
      if (quote?.regularMarketPrice !== undefined && quote.currency?.toUpperCase() === 'EUR') {
        debugLogs.push(`Attempt 1: EUR price found for ISIN ${isin}.`);
        finalQuoteForExtraction = quote;
        eurPriceFound = true;
      } else if (!finalQuoteForExtraction) {
        finalQuoteForExtraction = quote;
        debugLogs.push(`Attempt 1: ${isin} - Not EUR or incomplete. Price: ${quote?.regularMarketPrice}, Currency: ${quote?.currency}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      debugLogs.push(`Attempt 1: Error for ISIN ${isin}: ${errorMsg}`);
      console.warn(`[getPriceForIsin RB] Attempt 1: Error for ISIN ${isin}: ${errorMsg}`);
    }
  }

  // Attempt 2: Search by ISIN (if EUR price not found yet)
  if (!eurPriceFound) {
    debugLogs.push(`Attempt 2: Searching by ISIN ${isin}`);
    try {
      const searchResults = await yahooFinance.search(isin); 
      const searchQuotes = (searchResults.quotes || []); 
      debugLogs.push(`Attempt 2: Search returned ${searchQuotes.length} quotes.`);

      if (searchQuotes.length > 0) {
        const foundSearchQuote = searchQuotes.find(q => {
          const symbol = q.symbol; 
          const exchangeDisplay = q.exchDisp?.toUpperCase();
          return symbol &&
                 (symbol.endsWith('.PA') || symbol.endsWith('.DE') || symbol.endsWith('.MI') || symbol.endsWith('.AS') || symbol.endsWith('.MC') ||
                  exchangeDisplay?.includes('EURONEXT') || exchangeDisplay?.includes('XETRA') || exchangeDisplay?.includes('PARIS'));
        });

        if (foundSearchQuote?.symbol) {
          debugLogs.push(`Attempt 2: Found potential EUR match in search: ${foundSearchQuote.symbol} (Exchange in search: ${foundSearchQuote.exchDisp}). Fetching its full quote with modules: ${modulesToRequest}.`);
          const quoteFromSearchSymbol = await yahooFinance.quote(foundSearchQuote.symbol, {}, queryOptions);
          debugLogs.push(`Attempt 2: Full quote for ${foundSearchQuote.symbol} received - Price: ${quoteFromSearchSymbol?.regularMarketPrice}, Currency: ${quoteFromSearchSymbol?.currency}, Symbol: ${quoteFromSearchSymbol?.symbol}, Exchange: ${quoteFromSearchSymbol?.exchange}`);
          if (quoteFromSearchSymbol?.regularMarketPrice !== undefined && quoteFromSearchSymbol.currency?.toUpperCase() === 'EUR') {
            debugLogs.push(`Attempt 2: EUR price confirmed for searched symbol ${foundSearchQuote.symbol}.`);
            finalQuoteForExtraction = quoteFromSearchSymbol;
            eurPriceFound = true;
          } else {
             if (!finalQuoteForExtraction) { 
                finalQuoteForExtraction = quoteFromSearchSymbol;
             }
             debugLogs.push(`Attempt 2: Searched ${foundSearchQuote.symbol} - Full quote not EUR or incomplete. Price: ${quoteFromSearchSymbol?.regularMarketPrice}, Currency: ${quoteFromSearchSymbol?.currency}`);
          }
        } else {
          debugLogs.push(`Attempt 2: No promising EUR-likely symbol found in search results for ISIN ${isin}. Search results symbols: ${searchQuotes.map(q=> q.symbol).join(', ')}`);
        }
      } else {
        debugLogs.push(`Attempt 2: No quotes in search results for ISIN ${isin}.`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      debugLogs.push(`Attempt 2: Error during search/quote for ISIN ${isin}: ${errorMsg}`);
      console.error(`[getPriceForIsin RB] Attempt 2: Error during search/quote for ISIN ${isin}: ${errorMsg}`);
    }
  }
  
  let resultData: Partial<StockPriceData> = { id, isin };
  if (finalQuoteForExtraction) {
    debugLogs.push(`Final extraction using quote for symbol: ${finalQuoteForExtraction.symbol}`);
    resultData = extractDataFromQuote(finalQuoteForExtraction, isin, id, debugLogs);
    if (!eurPriceFound || finalQuoteForExtraction.currency?.toUpperCase() !== 'EUR') {
        debugLogs.push(`Final quote for ${isin} (ID: ${id}) was not in EUR (Currency: ${finalQuoteForExtraction.currency}). Clearing price.`);
        console.warn(`[getPriceForIsin RB] Final quote for ${isin} (ID: ${id}) was not in EUR (Currency: ${finalQuoteForExtraction.currency}). Clearing price.`);
        resultData.currentPrice = undefined; 
        resultData.currency = finalQuoteForExtraction.currency || resultData.currency; 
    } else {
        debugLogs.push(`EUR price successfully extracted for ${isin} (ID: ${id}): ${resultData.currentPrice}`);
        console.log(`[getPriceForIsin RB] EUR price successfully extracted for ${isin} (ID: ${id}): ${resultData.currentPrice}`);
    }
  } else {
    debugLogs.push(`No quote found for ISIN ${isin} (ID: ${id}) after all attempts. Returning with no price or details.`);
    console.warn(`[getPriceForIsin RB] No quote found for ISIN ${isin} (ID: ${id}) after all attempts. Returning with no price or details.`);
    resultData = { 
        id,
        isin,
        currentPrice: undefined,
        currency: undefined,
        symbol: preferredTicker, 
        exchange: undefined,
        ter: undefined,
        fundSize: undefined,
        categoryName: undefined,
        regularMarketChange: undefined,
        regularMarketChangePercent: undefined,
        regularMarketPreviousClose: undefined,
    };
  }
  resultData.debugLogs = debugLogs;
  console.log(`[getPriceForIsin RB] Final data for ISIN ${isin} (ID: ${id}):`, { ...resultData, debugLogs: `(${debugLogs.length} logs)` });
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
    console.log("[fetchStockPricesFlow RB] Starting flow for assets:", assets.map(a => a.isin));
    const pricePromises = assets.map(asset => getPriceForIsin(asset.isin, asset.id, asset.ticker));
    const results = await Promise.all(pricePromises);
    console.log("[fetchStockPricesFlow RB] Results from getPriceForIsin (summary):", results.map(r => ({isin: r.isin, price: r.currentPrice, currency: r.currency, ter: r.ter, fundSize: r.fundSize, category: r.categoryName, changePercent: r.regularMarketChangePercent, logsCount: r.debugLogs?.length || 0 })));
    return results.filter(r => r !== null) as FetchStockPricesOutput;
  }
);

