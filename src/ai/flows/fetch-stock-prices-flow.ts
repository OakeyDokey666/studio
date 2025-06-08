
'use server';
/**
 * @fileOverview Fetches latest stock prices using Yahoo Finance.
 *
 * - fetchStockPrices - A function that takes ISINs and returns current prices.
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
  })
).describe('An array of assets with their ISIN codes and IDs.');
export type FetchStockPricesInput = z.infer<typeof FetchStockPricesInputSchema>;

const StockPriceDataSchema = z.object({
  id: z.string().describe('The unique ID of the holding.'),
  isin: z.string().describe('The ISIN code of the asset.'),
  currentPrice: z.number().optional().describe('The latest market price.'),
  currency: z.string().optional().describe('The currency of the price.'),
  symbol: z.string().optional().describe('The ticker symbol found on Yahoo Finance.'),
});
export type StockPriceData = z.infer<typeof StockPriceDataSchema>;

const FetchStockPricesOutputSchema = z.array(StockPriceDataSchema).describe('An array of stock price data for the requested assets.');
export type FetchStockPricesOutput = z.infer<typeof FetchStockPricesOutputSchema>;


async function getPriceForIsin(isin: string, id: string): Promise<StockPriceData> {
  try {
    // Attempt 1: Directly use ISIN as symbol (works for some major exchanges)
    let quote = await yahooFinance.quote(isin);
    if (quote && quote.regularMarketPrice && quote.currency) {
      return {
        id,
        isin,
        currentPrice: quote.regularMarketPrice,
        currency: quote.currency,
        symbol: quote.symbol,
      };
    }

    // Attempt 2: Search by ISIN to get a ticker symbol
    const searchResults = await yahooFinance.search(isin);
    if (searchResults.quotes && searchResults.quotes.length > 0) {
      // Prioritize results with matching ISIN and EUR currency if possible
      let bestMatch = searchResults.quotes.find(q => q.isin === isin && q.exShortName?.includes('EUR'));
      if (!bestMatch) {
        bestMatch = searchResults.quotes.find(q => q.isin === isin);
      }
      if (!bestMatch) {
        bestMatch = searchResults.quotes[0]; // Fallback to the first result
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
          };
        }
      }
    }
    console.warn(`Could not find price for ISIN ${isin} (ID: ${id}) after direct quote and search.`);
    return { id, isin }; // Return without price if not found
  } catch (error) {
    console.error(`Error fetching price for ISIN ${isin} (ID: ${id}):`, error);
    return { id, isin }; // Return without price on error
  }
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
    const pricePromises = assets.map(asset => getPriceForIsin(asset.isin, asset.id));
    const results = await Promise.all(pricePromises);
    return results.filter(r => r !== null) as StockPriceData[];
  }
);
