
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
  fundSize: z.number().optional().describe('Fund Size / Assets Under Management (AUM) from fundProfile.totalAssets.raw.'),
  categoryName: z.string().optional().describe('Fund category from fundProfile.categoryName.'),
});
export type StockPriceData = z.infer<typeof StockPriceDataSchema>;

const FetchStockPricesOutputSchema = z.array(StockPriceDataSchema).describe('An array of stock price data for the requested assets.');
export type FetchStockPricesOutput = z.infer<typeof FetchStockPricesOutputSchema>;


async function getPriceForIsin(isin: string, id: string, preferredTicker?: string): Promise<StockPriceData> {
  console.log(`\n[getPriceForIsin] Processing ISIN: ${isin}, ID: ${id}, Preferred Ticker: ${preferredTicker}`);
  let quote; // This will hold the last quote object processed, potentially non-EUR or incomplete
  const euronextExchangeCodes = ['PAR', 'AMS', 'BRU', 'LIS', 'DUB', 'MCE', 'OSL'];
  
  const extractQuoteData = (q: any, attemptName: string): StockPriceData => {
    console.log(`[getPriceForIsin - ${attemptName}] Extracting data from quote:`, JSON.stringify(q, null, 2));
    const data = {
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
      fundSize: q.fundProfile?.totalAssets?.raw ?? q.summaryDetail?.totalAssets?.raw ?? q.summaryProfile?.totalAssets?.raw,
      categoryName: q.fundProfile?.categoryName,
    };
    console.log(`[getPriceForIsin - ${attemptName}] Extracted data:`, JSON.stringify(data, null, 2));
    return data;
  };
  
  const fieldsToFetch = ['price', 'summaryDetail', 'summaryProfile', 'fundProfile', 'defaultKeyStatistics', 'financialData'];

  // Attempt 0: Use preferredTicker if provided
  if (preferredTicker) {
    try {
      console.log(`[getPriceForIsin] Attempt 0: Fetching for preferred ticker ${preferredTicker}`);
      const preferredQuote = await yahooFinance.quote(preferredTicker, { fields: fieldsToFetch });
      
      if (preferredQuote) {
        console.log(`[getPriceForIsin] Attempt 0: Received quote for ${preferredTicker}: Price=${preferredQuote.regularMarketPrice}, Currency=${preferredQuote.currency}, Symbol=${preferredQuote.symbol}, Exchange=${preferredQuote.exchange}`);
        if (preferredQuote.regularMarketPrice !== undefined && preferredQuote.currency) {
          if (preferredQuote.currency.toUpperCase() === 'EUR') {
            console.log(`[getPriceForIsin] Attempt 0: EUR price found for ${preferredTicker}. Returning.`);
            return extractQuoteData(preferredQuote, "Attempt 0 - Preferred Ticker EUR");
          } else {
            quote = preferredQuote;
            console.warn(`[getPriceForIsin] Attempt 0: Preferred ticker ${preferredTicker} for ISIN ${isin} found price in ${preferredQuote.currency}, not EUR. Storing and falling back.`);
          }
        } else {
          quote = preferredQuote; 
          console.warn(`[getPriceForIsin] Attempt 0: Preferred ticker ${preferredTicker} for ISIN ${isin} quote was incomplete. Price: ${preferredQuote.regularMarketPrice}, Currency: ${preferredQuote.currency}. Storing and falling back.`);
        }
      } else {
        console.warn(`[getPriceForIsin] Attempt 0: Preferred ticker ${preferredTicker} for ISIN ${isin} returned no quote data (null/undefined). Falling back.`);
      }
    } catch (error) {
      console.error(`[getPriceForIsin] Attempt 0: Error fetching price for preferred ticker ${preferredTicker} (ISIN ${isin}). Error: ${error instanceof Error ? error.message : String(error)}. Falling back.`);
    }
  } else {
    console.log(`[getPriceForIsin] Attempt 0: No preferred ticker for ISIN ${isin}. Skipping.`);
  }

  // Attempt 1: Directly use ISIN as symbol
  try {
    console.log(`[getPriceForIsin] Attempt 1: Fetching for ISIN as symbol ${isin}`);
    const isinQuote = await yahooFinance.quote(isin, { fields: fieldsToFetch });
    if (isinQuote) {
      console.log(`[getPriceForIsin] Attempt 1: Received quote for ISIN ${isin}: Price=${isinQuote.regularMarketPrice}, Currency=${isinQuote.currency}, Symbol=${isinQuote.symbol}, Exchange=${isinQuote.exchange}`);
      if (isinQuote.regularMarketPrice !== undefined && isinQuote.currency) {
        if (isinQuote.currency.toUpperCase() === 'EUR') {
          console.log(`[getPriceForIsin] Attempt 1: EUR price found for ISIN ${isin}. Returning.`);
          return extractQuoteData(isinQuote, "Attempt 1 - ISIN Direct EUR");
        } else if (!quote || quote.currency?.toUpperCase() !== 'EUR') {
          quote = isinQuote;
          console.warn(`[getPriceForIsin] Attempt 1: ISIN ${isin} found price in ${isinQuote.currency}, not EUR. Storing over previous non-EUR/incomplete quote and falling back.`);
        }
      } else if (!quote) {
        quote = isinQuote;
        console.warn(`[getPriceForIsin] Attempt 1: ISIN ${isin} quote was incomplete. Price: ${isinQuote.regularMarketPrice}, Currency: ${isinQuote.currency}. Storing as fallback quote.`);
      }
    } else {
      console.warn(`[getPriceForIsin] Attempt 1: ISIN ${isin} returned no quote data (null/undefined). Falling back.`);
    }
  } catch (error) {
     console.warn(`[getPriceForIsin] Attempt 1: Direct quote with ISIN ${isin} failed. Error: ${error instanceof Error ? error.message : String(error)}. Will try searching.`);
  }

  // Attempt 2: Search by ISIN to get a ticker symbol
  try {
    console.log(`[getPriceForIsin] Attempt 2: Searching by ISIN ${isin}`);
    const searchResults = await yahooFinance.search(isin);
    console.log(`[getPriceForIsin] Attempt 2: Search results for ${isin}:`, JSON.stringify(searchResults.quotes?.slice(0,5), null, 2)); // Log first 5 results

    if (searchResults.quotes && searchResults.quotes.length > 0) {
      let bestMatch;

      console.log(`[getPriceForIsin] Attempt 2: Finding best match for ISIN ${isin}...`);
      bestMatch = searchResults.quotes.find(q =>
        q.isin === isin &&
        q.currency?.toUpperCase() === 'EUR' &&
        euronextExchangeCodes.some(exCode => q.exchange?.toUpperCase() === exCode)
      );
      if (bestMatch) console.log(`[getPriceForIsin] Attempt 2: Found Euronext EUR match: ${bestMatch.symbol}`);

      if (!bestMatch) {
        bestMatch = searchResults.quotes.find(q => q.isin === isin && q.currency?.toUpperCase() === 'EUR');
        if (bestMatch) console.log(`[getPriceForIsin] Attempt 2: Found any EUR match: ${bestMatch.symbol}`);
      }
      
      if (!bestMatch && preferredTicker) {
        bestMatch = searchResults.quotes.find(q => q.symbol === preferredTicker && q.isin === isin && q.currency?.toUpperCase() === 'EUR');
        if (bestMatch) console.log(`[getPriceForIsin] Attempt 2: Found preferred ticker EUR match in search: ${bestMatch.symbol}`);
      }
            
      if (!bestMatch) {
        bestMatch = searchResults.quotes.find(q => q.isin === isin && q.regularMarketPrice && q.currency);
         if (bestMatch) console.log(`[getPriceForIsin] Attempt 2: Found any ISIN match with price & currency: ${bestMatch.symbol} (Currency: ${bestMatch.currency})`);
      }

      if (!bestMatch && !preferredTicker) {
        bestMatch = searchResults.quotes.find(q => q.isin === isin);
        if (bestMatch) console.log(`[getPriceForIsin] Attempt 2: Found any ISIN match (last resort): ${bestMatch.symbol} (Currency: ${bestMatch.currency})`);
      }
      
      if (bestMatch && bestMatch.symbol) {
        console.log(`[getPriceForIsin] Attempt 2: Best match found: ${bestMatch.symbol}. Fetching quote for it.`);
        const searchDerivedQuote = await yahooFinance.quote(bestMatch.symbol, { fields: fieldsToFetch });
        if (searchDerivedQuote) {
          console.log(`[getPriceForIsin] Attempt 2: Received quote for searched symbol ${bestMatch.symbol}: Price=${searchDerivedQuote.regularMarketPrice}, Currency=${searchDerivedQuote.currency}, Symbol=${searchDerivedQuote.symbol}, Exchange=${searchDerivedQuote.exchange}`);
          if (searchDerivedQuote.regularMarketPrice !== undefined && searchDerivedQuote.currency) {
            if (searchDerivedQuote.currency.toUpperCase() === 'EUR') {
              console.log(`[getPriceForIsin] Attempt 2: EUR price found for searched symbol ${bestMatch.symbol}. Returning.`);
              return extractQuoteData(searchDerivedQuote, "Attempt 2 - Search Derived EUR");
            } else if (!quote || quote.currency?.toUpperCase() !== 'EUR') {
              quote = searchDerivedQuote;
              console.warn(`[getPriceForIsin] Attempt 2: Searched symbol ${bestMatch.symbol} found price in ${searchDerivedQuote.currency}, not EUR. Storing over previous non-EUR/incomplete and falling back.`);
            }
          } else if (!quote) {
            quote = searchDerivedQuote;
             console.warn(`[getPriceForIsin] Attempt 2: Searched symbol ${bestMatch.symbol} quote was incomplete. Storing as fallback quote.`);
          }
        } else {
           console.warn(`[getPriceForIsin] Attempt 2: Searched symbol ${bestMatch.symbol} returned no quote data. Falling back.`);
        }
      } else {
        console.log(`[getPriceForIsin] Attempt 2: No best match found or best match has no symbol for ISIN ${isin}.`);
      }
    } else {
      console.log(`[getPriceForIsin] Attempt 2: No quotes found in search results for ISIN ${isin}.`);
    }
  } catch (error) {
     console.error(`[getPriceForIsin] Attempt 2: Error during search or subsequent quote for ISIN ${isin}:`, error);
  }
  
  console.log(`[getPriceForIsin] Fallback logic: Evaluating stored quote for ISIN ${isin}. Stored quote (if any): Price=${quote?.regularMarketPrice}, Currency=${quote?.currency}`);
  let finalPrice = quote?.regularMarketPrice;
  let finalCurrency = quote?.currency;
  let finalSymbol = quote?.symbol || preferredTicker;

  if (finalPrice !== undefined && finalCurrency && finalCurrency.toUpperCase() !== 'EUR') {
    console.warn(`[getPriceForIsin] Fallback: Final quote for symbol ${finalSymbol} (ISIN ${isin}) was in ${finalCurrency}. Discarding price.`);
    finalPrice = undefined;
    finalCurrency = undefined;
  } else if (finalPrice === undefined) {
    console.warn(`[getPriceForIsin] Fallback: No price found after all attempts for symbol ${finalSymbol} (ISIN ${isin}).`);
  } else {
    console.log(`[getPriceForIsin] Fallback: Successfully determined EUR price ${finalPrice} for symbol ${finalSymbol} (ISIN ${isin}).`);
  }

  const returnData: StockPriceData = {
    id,
    isin,
    currentPrice: finalPrice,
    currency: finalCurrency,
    symbol: finalSymbol,
    exchange: quote?.exchange,
    regularMarketChange: finalPrice !== undefined ? quote?.regularMarketChange : undefined,
    regularMarketChangePercent: finalPrice !== undefined ? quote?.regularMarketChangePercent : undefined,
    regularMarketVolume: quote?.regularMarketVolume,
    averageDailyVolume10Day: quote?.averageDailyVolume10Day || quote?.averageDailyVolume3Month,
    marketCap: quote?.marketCap,
    trailingPE: quote?.trailingPE,
    epsTrailingTwelveMonths: quote?.epsTrailingTwelveMonths,
    fiftyTwoWeekLow: quote?.fiftyTwoWeekLow,
    fiftyTwoWeekHigh: quote?.fiftyTwoWeekHigh,
    ter: quote?.fundProfile?.annualReportExpenseRatio?.raw,
    fundSize: quote?.fundProfile?.totalAssets?.raw ?? quote?.summaryDetail?.totalAssets?.raw ?? quote?.summaryProfile?.totalAssets?.raw,
    categoryName: quote?.fundProfile?.categoryName,
  };
  console.log(`[getPriceForIsin] Final return data for ISIN ${isin}:`, JSON.stringify(returnData, null, 2));
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
    return results.filter(r => r !== null) as StockPriceData[]; 
  }
);

