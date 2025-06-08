
'use server';
/**
 * @fileOverview Fetches latest stock prices using Yahoo Finance.
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
  currentPrice: z.number().optional().describe('The latest market price.'),
  currency: z.string().optional().describe('The currency of the price.'),
  symbol: z.string().optional().describe('The ticker symbol found on Yahoo Finance.'),
  exchange: z.string().optional().describe('The exchange the price was sourced from (e.g., PAR, LSE).'),
});
export type StockPriceData = z.infer<typeof StockPriceDataSchema>;

const FetchStockPricesOutputSchema = z.array(StockPriceDataSchema).describe('An array of stock price data for the requested assets.');
export type FetchStockPricesOutput = z.infer<typeof FetchStockPricesOutputSchema>;


async function getPriceForIsin(isin: string, id: string, preferredTicker?: string): Promise<StockPriceData> {
  let quote;
  const euronextExchangeCodes = ['PAR', 'AMS', 'BRU', 'LIS', 'DUB', 'MCE', 'OSL']; // Paris, Amsterdam, Brussels, Lisbon, Dublin, Madrid, Oslo

  // Attempt 0: Use preferredTicker if provided
  if (preferredTicker) {
    try {
      quote = await yahooFinance.quote(preferredTicker);
      if (quote && quote.regularMarketPrice && quote.currency) {
        return {
          id,
          isin,
          currentPrice: quote.regularMarketPrice,
          currency: quote.currency,
          symbol: quote.symbol || preferredTicker,
          exchange: quote.exchange,
        };
      }
    } catch (error) {
      console.warn(`Failed to fetch price for preferred ticker ${preferredTicker} (ISIN: ${isin}, ID: ${id}). Error: ${error instanceof Error ? error.message : String(error)}. Falling back to other methods.`);
    }
  }

  // Attempt 1: Directly use ISIN as symbol (works for some major exchanges)
  try {
    quote = await yahooFinance.quote(isin);
    if (quote && quote.regularMarketPrice && quote.currency) {
      return {
        id,
        isin,
        currentPrice: quote.regularMarketPrice,
        currency: quote.currency,
        symbol: quote.symbol,
        exchange: quote.exchange,
      };
    }
  } catch (error) {
     // console.warn(`Direct quote with ISIN ${isin} failed. Will try searching.`);
  }

  // Attempt 2: Search by ISIN to get a ticker symbol
  try {
    const searchResults = await yahooFinance.search(isin);
    if (searchResults.quotes && searchResults.quotes.length > 0) {
      let bestMatch;

      // Priority 1: ISIN match, Euronext exchange, EUR currency
      bestMatch = searchResults.quotes.find(q =>
        q.isin === isin &&
        q.currency?.toUpperCase() === 'EUR' &&
        euronextExchangeCodes.some(exCode => q.exchange?.toUpperCase() === exCode)
      );

      // Priority 2: ISIN match, any exchange, EUR currency
      if (!bestMatch) {
        bestMatch = searchResults.quotes.find(q => q.isin === isin && q.currency?.toUpperCase() === 'EUR');
      }
      
      // Priority 3: ISIN match, preferredTicker symbol (if initial direct quote failed)
      if (!bestMatch && preferredTicker) {
        bestMatch = searchResults.quotes.find(q => q.symbol === preferredTicker && q.isin === isin);
      }
      
      // Priority 4: ISIN match, any exchange (fallback if EUR not found)
      if (!bestMatch) {
        bestMatch = searchResults.quotes.find(q => q.isin === isin);
      }
      
      // Priority 5: First quote if still no specific match (less ideal)
      if (!bestMatch && searchResults.quotes.length > 0) {
        bestMatch = searchResults.quotes[0];
      }
      
      if (bestMatch && bestMatch.symbol) {
        quote = await yahooFinance.quote(bestMatch.symbol);
        if (quote && quote.regularMarketPrice && quote.currency) {
          return {
            id,
            isin,
            currentPrice: quote.regularMarketPrice,
            currency: quote.currency,
            symbol: quote.symbol,
            exchange: quote.exchange,
          };
        }
      }
    }
  } catch (error) {
     console.error(`Error during search or quote for ISIN ${isin} (ID: ${id}):`, error);
  }
  
  console.warn(`Could not find price for ISIN ${isin} (ID: ${id}, Ticker: ${preferredTicker}) after all attempts.`);
  return { id, isin, symbol: preferredTicker }; // Return without price if not found
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
