
'use client';

import type { PortfolioHolding, ParsedCsvData, RoundingOption } from '@/types/portfolio';
import type { FetchStockPricesInput, StockPriceData } from '@/ai/flows/fetch-stock-prices-flow';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { SummarySection } from '@/components/SummarySection';
import { HoldingsTable } from '@/components/HoldingsTable';
import { RebalanceAdvisor } from '@/components/RebalanceAdvisor';
import { calculatePortfolioMetrics } from '@/lib/portfolioUtils';
import { fetchStockPrices } from '@/ai/flows/fetch-stock-prices-flow';
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal } from "lucide-react";

interface InvestoTrackAppProps {
  initialData: ParsedCsvData;
}

const isinToTickerMap: Record<string, string> = {
  "FR0013412012": "PAASI.PA", // Amundi PEA MSCI Emerging Asia
  "LU1812092168": "SEL.PA", // Amundi Stoxx Europe Select Dividend 30
  "IE00B4K6B022": "50E.PA", // HSBC EURO STOXX 50 (Corrected)
  "IE00BZ4BMM98": "EUHD.PA", // Invesco EURO STOXX High Dividend Low Volatility
  "IE0002XZSHO1": "WPEA.PA", // iShares MSCI World Swap PEA
  "IE00B5M1WJ87": "EUDV.PA" // SPDR S&P Euro Dividend Aristocrats
};

// Define a type for the structure stored in currentPricesMap
type PriceMapEntry = {
  price?: number;
  exchange?: string;
  regularMarketVolume?: number;
  averageDailyVolume10Day?: number;
  marketCap?: number;
  trailingPE?: number;
  epsTrailingTwelveMonths?: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHigh?: number;
  ter?: number;
  fundSize?: number;
  categoryName?: string;
};


export function InvestoTrackApp({ initialData }: InvestoTrackAppProps) {
  const [portfolioHoldings, setPortfolioHoldings] = useState<PortfolioHolding[]>([]);
  const [baseHoldings, setBaseHoldings] = useState<PortfolioHolding[]>([]);
  const [newInvestmentAmount, setNewInvestmentAmount] = useState<number | undefined>(initialData.initialNewInvestmentAmount);
  const [roundingOption, setRoundingOption] = useState<RoundingOption>('classic');
  const [csvErrors, setCsvErrors] = useState<string[]>(initialData.csvErrors || []);
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [pricesLastUpdated, setPricesLastUpdated] = useState<Date | null>(null);
  const { toast } = useToast();
  const initialRefreshDoneRef = useRef(false);
  const [currentPricesMap, setCurrentPricesMap] = useState<Map<string, PriceMapEntry>>(new Map());

  // Effect 1: Set up baseHoldings from initialData, clearing dynamic price fields
  useEffect(() => {
    const initialSetup = initialData.holdings.map(h => ({
      ...h,
      ticker: h.ticker || isinToTickerMap[h.isin] || undefined,
      currentPrice: undefined,
      currentAmount: undefined,
      priceSourceExchange: undefined,
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
    }));
    setBaseHoldings(initialSetup);
  }, [initialData.holdings]);

  // Effect 2: Main calculation effect for portfolioHoldings
  useEffect(() => {
    if (baseHoldings.length === 0) {
      if (initialData.holdings.length === 0) {
        setPortfolioHoldings([]);
      }
      return;
    }

    const holdingsWithLivePrices = baseHoldings.map(h => {
      const priceInfo = currentPricesMap.get(h.id);
      const livePrice = priceInfo?.price;

      return {
        ...h,
        currentPrice: livePrice, 
        currentAmount: livePrice !== undefined ? h.quantity * livePrice : undefined,
        priceSourceExchange: priceInfo?.exchange ?? h.priceSourceExchange,
        regularMarketVolume: priceInfo?.regularMarketVolume,
        averageDailyVolume10Day: priceInfo?.averageDailyVolume10Day,
        marketCap: priceInfo?.marketCap,
        trailingPE: priceInfo?.trailingPE,
        epsTrailingTwelveMonths: priceInfo?.epsTrailingTwelveMonths,
        fiftyTwoWeekLow: priceInfo?.fiftyTwoWeekLow,
        fiftyTwoWeekHigh: priceInfo?.fiftyTwoWeekHigh,
        ter: priceInfo?.ter ?? h.ter, 
        fundSize: priceInfo?.fundSize ?? h.fundSize,
        categoryName: priceInfo?.categoryName ?? h.categoryName,
      };
    });

    const metricsApplied = calculatePortfolioMetrics(holdingsWithLivePrices, newInvestmentAmount, roundingOption);
    setPortfolioHoldings(metricsApplied);

  }, [baseHoldings, currentPricesMap, newInvestmentAmount, roundingOption, initialData.holdings]);


  const handleRefreshPrices = useCallback(async () => {
    if (isRefreshingPrices) {
      console.log("[InvestoTrackApp] Price refresh already in progress.");
      return;
    }
    setIsRefreshingPrices(true);
    console.log("[InvestoTrackApp] Starting price refresh for baseHoldings:", baseHoldings);
    try {
      const assetsToFetch: FetchStockPricesInput = baseHoldings.map(h => ({
        isin: h.isin,
        id: h.id,
        ticker: h.ticker
      }));

      console.log("[InvestoTrackApp] Assets to fetch:", assetsToFetch);

      if (assetsToFetch.length === 0) {
        console.log("[InvestoTrackApp] No base holdings to refresh.");
        if (initialRefreshDoneRef.current) {
             toast({ title: "No holdings to refresh", description: "Your portfolio is empty." });
        }
        setIsRefreshingPrices(false);
        return;
      }

      const fetchedPricesData: StockPriceData[] = await fetchStockPrices(assetsToFetch);
      console.log("[InvestoTrackApp] Fetched prices raw data from flow:", fetchedPricesData);

      let pricesUpdatedCount = 0;
      let nonEurCurrencyWarnings: string[] = [];
      let notFoundWarnings: string[] = [];
      const newPricesMapUpdates = new Map<string, PriceMapEntry>();

      fetchedPricesData.forEach(priceData => {
        const holdingFromBase = baseHoldings.find(h => h.id === priceData.id);
        if (holdingFromBase) {
          const existingEntry = currentPricesMap.get(holdingFromBase.id);
          let entryToSet: PriceMapEntry = {
            exchange: priceData.exchange,
            regularMarketVolume: priceData.regularMarketVolume,
            averageDailyVolume10Day: priceData.averageDailyVolume10Day,
            marketCap: priceData.marketCap,
            trailingPE: priceData.trailingPE,
            epsTrailingTwelveMonths: priceData.epsTrailingTwelveMonths,
            fiftyTwoWeekLow: priceData.fiftyTwoWeekLow,
            fiftyTwoWeekHigh: priceData.fiftyTwoWeekHigh,
            ter: priceData.ter,
            fundSize: priceData.fundSize,
            categoryName: priceData.categoryName,
          };

          // The flow should now only return currentPrice if it's EUR.
          // If currentPrice is undefined, it means no EUR price was found.
          if (priceData.currentPrice !== undefined) {
            if (priceData.currency?.toUpperCase() === 'EUR') {
                pricesUpdatedCount++;
                entryToSet.price = priceData.currentPrice;
                console.log(`[InvestoTrackApp] Price updated for ${holdingFromBase.name}: ${priceData.currentPrice} ${priceData.currency}`);
            } else {
                // This case should ideally not happen if the flow filters correctly, but as a safeguard:
                nonEurCurrencyWarnings.push(`Holding ${holdingFromBase.name} (${priceData.symbol || holdingFromBase.isin}) received non-EUR price ${priceData.currentPrice} ${priceData.currency} from flow. Price not updated.`);
                entryToSet.price = existingEntry?.price; // Keep old price
            }
          } else {
            // currentPrice is undefined from the flow
            notFoundWarnings.push(`Could not find EUR price for ${holdingFromBase.name} (ISIN: ${holdingFromBase.isin}, Symbol: ${priceData.symbol || holdingFromBase.ticker || 'N/A'}, Reported Exchange: ${priceData.exchange || 'N/A'}).`);
            entryToSet.price = existingEntry?.price; // Keep old price if new one not found
             console.log(`[InvestoTrackApp] No EUR price found by flow for ${holdingFromBase.name}. Current value in map: ${existingEntry?.price}`);
          }
          newPricesMapUpdates.set(holdingFromBase.id, entryToSet);
        }
      });
      
      setCurrentPricesMap(prevMap => {
        const combinedMap = new Map(prevMap); 
        baseHoldings.forEach(bh => { 
            if (!combinedMap.has(bh.id)) { 
                combinedMap.set(bh.id, { /* default empty entry */ });
            }
        });
        newPricesMapUpdates.forEach((value, key) => { 
            combinedMap.set(key, value);
        });
        return combinedMap;
      });


      if (pricesUpdatedCount > 0) {
        setPricesLastUpdated(new Date());
      }

      if (pricesUpdatedCount > 0) {
        toast({ title: "Prices Refreshed", description: `${pricesUpdatedCount} holding(s) updated.` });
      } else if (initialRefreshDoneRef.current || assetsToFetch.length > 0) {
        if (nonEurCurrencyWarnings.length === 0 && notFoundWarnings.length === 0) {
          toast({ title: "Prices Checked", description: "No new EUR prices were found or they were already current." });
        }
      }

      if (nonEurCurrencyWarnings.length > 0) {
        toast({
          title: "Currency Mismatch During Update",
          description: (
            <ul className="list-disc pl-5">
              {nonEurCurrencyWarnings.map((warning, idx) => <li key={idx}>{warning}</li>)}
            </ul>
          ),
          variant: "destructive",
          duration: 10000,
        });
      }
      if (notFoundWarnings.length > 0) {
         toast({
          title: "Price Not Found",
          description: (
            <ul className="list-disc pl-5">
              {notFoundWarnings.map((warning, idx) => <li key={idx}>{warning}</li>)}
            </ul>
          ),
          variant: "default", // Changed from destructive as it's informational if some are found, some not
          duration: 10000,
        });
      }

    } catch (error) {
      console.error("[InvestoTrackApp] Error refreshing prices:", error);
      toast({ title: "Error Refreshing Prices", description: `Could not fetch latest prices. ${error instanceof Error ? error.message : String(error)}`, variant: "destructive" });
    } finally {
      setIsRefreshingPrices(false);
    }
  }, [isRefreshingPrices, baseHoldings, toast, currentPricesMap]); 


  // Effect 3: Initial automatic price refresh
  useEffect(() => {
    if (baseHoldings.length > 0 && !initialRefreshDoneRef.current && !isRefreshingPrices) {
      handleRefreshPrices();
      initialRefreshDoneRef.current = true;
    }
  }, [baseHoldings, handleRefreshPrices, isRefreshingPrices]);


  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader
        onRefreshPrices={handleRefreshPrices}
        isRefreshingPrices={isRefreshingPrices}
        pricesLastUpdated={pricesLastUpdated}
      />
      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {csvErrors.length > 0 && (
          <Alert variant="destructive">
            <Terminal className="h-4 w-4" />
            <AlertTitle>CSV Parsing Issues</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-5">
                {csvErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <SummarySection holdings={portfolioHoldings} newInvestmentAmount={newInvestmentAmount} />

        <HoldingsTable holdings={portfolioHoldings} />

        <RebalanceAdvisor
          holdings={portfolioHoldings}
          newInvestmentAmount={newInvestmentAmount}
          setNewInvestmentAmount={setNewInvestmentAmount}
          roundingOption={roundingOption}
          setRoundingOption={setRoundingOption}
        />
      </main>
      <footer className="py-6 text-center text-sm text-muted-foreground border-t border-border">
        © {new Date().getFullYear()} InvestoTrack. Powered by Firebase Studio.
      </footer>
    </div>
  );
}

