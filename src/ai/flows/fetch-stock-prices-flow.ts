
'use server';
/**
 * @fileOverview Fetches latest stock prices using Yahoo Finance.
 * This is a simplified version focused on getting basic EUR price.
 *
 * - fetchStockPrices - A function that takes ISINs (and optional tickers) and returns current prices.
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
  currentPrice: z.number().optional().describe('The latest market price in EUR.'),
  currency: z.string().optional().describe('The currency of the price found.'),
  symbol: z.string().optional().describe('The ticker symbol found on Yahoo Finance.'),
  exchange: z.string().optional().describe('The exchange the price was sourced from.'),
});
export type StockPriceData = z.infer<typeof StockPriceDataSchema>;

const FetchStockPricesOutputSchema = z.array(StockPriceDataSchema).describe('An array of stock price data for the requested assets.');
export type FetchStockPricesOutput = z.infer<typeof FetchStockPricesOutputSchema>;


async function getPriceForIsin(isin: string, id: string, preferredTicker?: string): Promise<StockPriceData> {
  console.log(`\n[getPriceForIsin SIMPLIFIED] Processing ISIN: ${isin}, ID: ${id}, Ticker: ${preferredTicker}`);
  // Use specific field names known to yahoo-finance2
  const fieldsToFetch: ("symbol" | "currency" | "exchange" | "regularMarketPrice")[] = ['regularMarketPrice', 'currency', 'symbol', 'exchange'];

  // Attempt 1: Preferred Ticker
  if (preferredTicker) {
    try {
      console.log(`[getPriceForIsin SIMPLIFIED] Attempt 1: Fetching preferred ticker ${preferredTicker}`);
      const quote = await yahooFinance.quote(preferredTicker, { fields: fieldsToFetch });
      console.log(`[getPriceForIsin SIMPLIFIED] Attempt 1: ${preferredTicker} quote received:`, { price: quote?.regularMarketPrice, currency: quote?.currency, symbol: quote?.symbol, exchange: quote?.exchange });
      if (quote?.regularMarketPrice !== undefined && quote.currency?.toUpperCase() === 'EUR') {
        console.log(`[getPriceForIsin SIMPLIFIED] Attempt 1: EUR price found for ${preferredTicker}.`);
        return {
          id,
          isin,
          currentPrice: quote.regularMarketPrice,
          currency: quote.currency,
          symbol: quote.symbol || preferredTicker,
          exchange: quote.exchange,
        };
      }
      console.log(`[getPriceForIsin SIMPLIFIED] Attempt 1: ${preferredTicker} - Not EUR or incomplete.`);
    } catch (error) {
      console.error(`[getPriceForIsin SIMPLIFIED] Attempt 1: Error for ${preferredTicker}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Attempt 2: ISIN as Symbol
  try {
    console.log(`[getPriceForIsin SIMPLIFIED] Attempt 2: Fetching ISIN as symbol ${isin}`);
    const quote = await yahooFinance.quote(isin, { fields: fieldsToFetch });
     console.log(`[getPriceForIsin SIMPLIFIED] Attempt 2: ${isin} quote received:`, { price: quote?.regularMarketPrice, currency: quote?.currency, symbol: quote?.symbol, exchange: quote?.exchange });
    if (quote?.regularMarketPrice !== undefined && quote.currency?.toUpperCase() === 'EUR') {
      console.log(`[getPriceForIsin SIMPLIFIED] Attempt 2: EUR price found for ISIN ${isin}.`);
      return {
        id,
        isin,
        currentPrice: quote.regularMarketPrice,
        currency: quote.currency,
        symbol: quote.symbol,
        exchange: quote.exchange,
      };
    }
    console.log(`[getPriceForIsin SIMPLIFIED] Attempt 2: ${isin} - Not EUR or incomplete.`);
  } catch (error) {
    console.warn(`[getPriceForIsin SIMPLIFIED] Attempt 2: Error for ISIN ${isin}: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // Attempt 3: Search by ISIN (very basic)
  try {
    console.log(`[getPriceForIsin SIMPLIFIED] Attempt 3: Searching by ISIN ${isin}`);
    const searchResults = await yahooFinance.search(isin);
    if (searchResults.quotes && searchResults.quotes.length > 0) {
      // Use optional chaining for safety as search results can have varied structures
      const eurQuoteFromSearch = searchResults.quotes.find(q => q.isin === isin && q.currency?.toUpperCase() === 'EUR' && q.symbol);
      
      if (eurQuoteFromSearch?.symbol) {
        console.log(`[getPriceForIsin SIMPLIFIED] Attempt 3: Found potential EUR match in search: ${eurQuoteFromSearch.symbol}. Fetching its quote.`);
        const quote = await yahooFinance.quote(eurQuoteFromSearch.symbol, { fields: fieldsToFetch });
        console.log(`[getPriceForIsin SIMPLIFIED] Attempt 3: ${eurQuoteFromSearch.symbol} quote received:`, { price: quote?.regularMarketPrice, currency: quote?.currency, symbol: quote?.symbol, exchange: quote?.exchange });
        if (quote?.regularMarketPrice !== undefined && quote.currency?.toUpperCase() === 'EUR') {
           console.log(`[getPriceForIsin SIMPLIFIED] Attempt 3: EUR price found for searched symbol ${eurQuoteFromSearch.symbol}.`);
           return {
            id,
            isin,
            currentPrice: quote.regularMarketPrice,
            currency: quote.currency,
            symbol: quote.symbol || eurQuoteFromSearch.symbol, // Prioritize quote.symbol
            exchange: quote.exchange,
           };
        }
        console.log(`[getPriceForIsin SIMPLIFIED] Attempt 3: Searched ${eurQuoteFromSearch.symbol} - Not EUR or incomplete after fetching.`);
      } else {
        console.log(`[getPriceForIsin SIMPLIFIED] Attempt 3: No direct EUR match with symbol in search results for ISIN ${isin}. Possible results:`, searchResults.quotes.map(q=> ({symbol: q.symbol, isin: q.isin, currency: q.currency, name: q.shortname})));
      }
    } else {
      console.log(`[getPriceForIsin SIMPLIFIED] Attempt 3: No quotes in search results for ISIN ${isin}.`);
    }
  } catch (error) {
    console.error(`[getPriceForIsin SIMPLIFIED] Attempt 3: Error during search for ISIN ${isin}: ${error instanceof Error ? error.message : String(error)}`);
  }


  console.warn(`[getPriceForIsin SIMPLIFIED] No EUR price found for ISIN ${isin} after all attempts.`);
  return {
    id,
    isin,
    currentPrice: undefined,
    currency: undefined,
    symbol: preferredTicker, 
    exchange: undefined,
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
    console.log("[fetchStockPricesFlow SIMPLIFIED] Starting flow for assets:", assets);
    const pricePromises = assets.map(asset => getPriceForIsin(asset.isin, asset.id, asset.ticker));
    const results = await Promise.all(pricePromises);
    console.log("[fetchStockPricesFlow SIMPLIFIED] Results from getPriceForIsin:", results);
    return results;
  }
);

