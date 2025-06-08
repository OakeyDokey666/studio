
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
  regularMarketChange: z.number().optional().describe('The change in price from the previous close.'),
  regularMarketChangePercent: z.number().optional().describe('The percentage change in price from the previous close.'),
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
        if (quote.currency.toUpperCase() === 'EUR') {
          return {
            id,
            isin,
            currentPrice: quote.regularMarketPrice,
            currency: quote.currency,
            symbol: quote.symbol || preferredTicker,
            exchange: quote.exchange,
            regularMarketChange: quote.regularMarketChange,
            regularMarketChangePercent: quote.regularMarketChangePercent,
          };
        } else {
          console.warn(`Preferred ticker ${preferredTicker} for ISIN ${isin} (ID: ${id}) found price in ${quote.currency}, not EUR. Falling back to ISIN search.`);
        }
      }
    } catch (error) {
      console.warn(`Failed to fetch price for preferred ticker ${preferredTicker} (ISIN: ${isin}, ID: ${id}). Error: ${error instanceof Error ? error.message : String(error)}. Falling back to ISIN search.`);
    }
  }

  // Attempt 1: Directly use ISIN as symbol (works for some major exchanges)
  try {
    quote = await yahooFinance.quote(isin);
    if (quote && quote.regularMarketPrice && quote.currency && quote.currency.toUpperCase() === 'EUR') {
      return {
        id,
        isin,
        currentPrice: quote.regularMarketPrice,
        currency: quote.currency,
        symbol: quote.symbol,
        exchange: quote.exchange,
        regularMarketChange: quote.regularMarketChange,
        regularMarketChangePercent: quote.regularMarketChangePercent,
      };
    }
  } catch (error) {
     // console.warn(`Direct quote with ISIN ${isin} failed or not in EUR. Will try searching.`);
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

      // Priority 2: ISIN match, any other exchange, EUR currency
      if (!bestMatch) {
        bestMatch = searchResults.quotes.find(q => q.isin === isin && q.currency?.toUpperCase() === 'EUR');
      }
      
      // Priority 3: ISIN match, preferredTicker symbol AND EUR currency (if initial direct quote failed or was non-EUR)
      if (!bestMatch && preferredTicker) {
        bestMatch = searchResults.quotes.find(q => q.symbol === preferredTicker && q.isin === isin && q.currency?.toUpperCase() === 'EUR');
      }
      
      // Priority 4: ISIN match, any exchange but still EUR (redundant with P2 but safe)
      if (!bestMatch) {
        bestMatch = searchResults.quotes.find(q => q.isin === isin && q.currency?.toUpperCase() === 'EUR');
      }
      
      // Priority 5: If still no EUR match, take the first ISIN match with a price (might be non-EUR, app layer will handle it)
      if (!bestMatch) {
        bestMatch = searchResults.quotes.find(q => q.isin === isin && q.regularMarketPrice && q.currency);
      }

      // Priority 6: Fallback to first quote with ISIN match if absolutely no price found earlier
      if (!bestMatch && !preferredTicker) { // Only if no preferred ticker was involved in earlier non-EUR issues
        bestMatch = searchResults.quotes.find(q => q.isin === isin);
      }


      if (bestMatch && bestMatch.symbol) {
        // Refetch using the bestMatch symbol to ensure full quote data
        quote = await yahooFinance.quote(bestMatch.symbol);
        if (quote && quote.regularMarketPrice && quote.currency) {
           // We trust this quote now as it came from a prioritized search for EUR
          return {
            id,
            isin,
            currentPrice: quote.regularMarketPrice,
            currency: quote.currency,
            symbol: quote.symbol,
            exchange: quote.exchange,
            regularMarketChange: quote.regularMarketChange,
            regularMarketChangePercent: quote.regularMarketChangePercent,
          };
        }
      }
    }
  } catch (error) {
     console.error(`Error during search or quote for ISIN ${isin} (ID: ${id}):`, error);
  }
  
  console.warn(`Could not find EUR price for ISIN ${isin} (ID: ${id}, Ticker: ${preferredTicker}) after all attempts. Best symbol found: ${quote?.symbol || 'N/A'}`);
  return { 
    id, 
    isin, 
    symbol: preferredTicker || quote?.symbol, 
    exchange: quote?.exchange,
    regularMarketChange: quote?.regularMarketChange,
    regularMarketChangePercent: quote?.regularMarketChangePercent,
  }; // Return without price if not found or not EUR
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
    // The app layer (InvestoTrackApp.tsx) will handle filtering for EUR if necessary
    return results.filter(r => r !== null) as StockPriceData[];
  }
);
