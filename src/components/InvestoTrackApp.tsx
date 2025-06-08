
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
  "FR0013412012": "PAASI.PA",
  "LU1812092168": "SEL.PA",
  "IE00B4K6B022": "50E.PA",
  "IE00BZ4BMM98": "EUHD.PA",
  "IE0002XZSHO1": "WPEA.PA",
  "IE00B5M1WJ87": "EUDV.PA"
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
  const [currentPricesMap, setCurrentPricesMap] = useState<Map<string, {price: number, exchange?: string}>>(new Map());

  // Effect 1: Set up baseHoldings from initialData, clearing dynamic price fields
  useEffect(() => {
    const initialSetup = initialData.holdings.map(h => ({
      ...h,
      ticker: h.ticker || isinToTickerMap[h.isin] || undefined,
      currentPrice: undefined, // Explicitly undefined until fetched
      currentAmount: undefined, // Explicitly undefined until calculated from fetched price
      priceSourceExchange: undefined, // Explicitly undefined until fetched
    }));
    setBaseHoldings(initialSetup);
  }, [initialData.holdings]); // Only re-run if initialData.holdings changes

  // Effect 2: Main calculation effect for portfolioHoldings
  // Runs when baseHoldings, currentPricesMap, newInvestmentAmount, or roundingOption change
  useEffect(() => {
    if (baseHoldings.length === 0) {
      // If initialData itself was empty, or baseHoldings not yet populated.
      if (initialData.holdings.length === 0) {
        setPortfolioHoldings([]);
      }
      // If initialData.holdings is not empty but baseHoldings is,
      // it means Effect 1 hasn't run or completed yet. This effect will run again once baseHoldings is set.
      return;
    }

    // Step 1: Apply live/fetched prices to the base holdings structure
    const holdingsWithLivePrices = baseHoldings.map(h => {
      const priceInfo = currentPricesMap.get(h.id);
      const livePrice = priceInfo?.price;

      return {
        ...h,
        currentPrice: livePrice, // Will be undefined if not in map
        currentAmount: livePrice !== undefined ? h.quantity * livePrice : undefined, // Calculate if livePrice exists
        priceSourceExchange: priceInfo?.exchange ?? h.priceSourceExchange, // Use exchange from map or existing (which is undefined from base)
      };
    });

    // Step 2: Apply all other portfolio metrics (allocations, new investment calculations, etc.)
    const metricsApplied = calculatePortfolioMetrics(holdingsWithLivePrices, newInvestmentAmount, roundingOption);
    setPortfolioHoldings(metricsApplied);

  }, [baseHoldings, currentPricesMap, newInvestmentAmount, roundingOption, initialData.holdings]);


  const handleRefreshPrices = useCallback(async () => {
    if (isRefreshingPrices) {
      console.log("[InvestoTrackApp] Price refresh already in progress.");
      return;
    }
    setIsRefreshingPrices(true);
    console.log("[InvestoTrackApp] Starting price refresh for baseHoldings:", baseHoldings); // Log baseHoldings
    try {
      // Use baseHoldings to construct assetsToFetch, ensuring we always try to refresh all initial items
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

      const fetchedPrices: StockPriceData[] = await fetchStockPrices(assetsToFetch);
      console.log("[InvestoTrackApp] Fetched prices raw data:", fetchedPrices);

      let pricesUpdatedCount = 0;
      let nonEurCurrencyWarnings: string[] = [];
      let notFoundWarnings: string[] = [];
      const newPricesMapUpdates = new Map<string, {price: number, exchange?: string}>();

      fetchedPrices.forEach(priceData => {
        const holdingFromBase = baseHoldings.find(h => h.id === priceData.id); // Check against baseHoldings
        if (holdingFromBase) {
          if (priceData.currentPrice !== undefined && priceData.currency) {
            if (priceData.currency.toUpperCase() !== 'EUR') {
              nonEurCurrencyWarnings.push(`Holding ${holdingFromBase.name} (${priceData.symbol || holdingFromBase.isin} on ${priceData.exchange || 'N/A'}) price is in ${priceData.currency}, not EUR. Price not updated.`);
              // Store exchange even if non-EUR, but DO NOT store the non-EUR price.
              // The main useEffect will use undefined for price if not in map or not EUR.
               newPricesMapUpdates.set(holdingFromBase.id, { 
                price: currentPricesMap.get(holdingFromBase.id)?.price ?? undefined, // Keep existing EUR price or undefined
                exchange: priceData.exchange 
              });
            } else {
              pricesUpdatedCount++;
              newPricesMapUpdates.set(holdingFromBase.id, { price: priceData.currentPrice, exchange: priceData.exchange });
            }
          } else {
            notFoundWarnings.push(`Could not find EUR price for ${holdingFromBase.name} (ISIN: ${holdingFromBase.isin}, Ticker: ${priceData.symbol || holdingFromBase.ticker || 'N/A'}, Exchange: ${priceData.exchange || 'N/A'}).`);
            // Store exchange even if price not found, price remains undefined.
            newPricesMapUpdates.set(holdingFromBase.id, { 
              price: currentPricesMap.get(holdingFromBase.id)?.price ?? undefined, // Keep existing EUR price or undefined
              exchange: priceData.exchange 
            });
          }
        }
      });
      
      // Update currentPricesMap by merging:
      // Start with a map that ensures all base holdings have an entry (value can be old price or undefined)
      // Then overlay with new valid updates.
      setCurrentPricesMap(prevMap => {
        const combinedMap = new Map(prevMap); // Start with previous prices
        baseHoldings.forEach(bh => { // Ensure all base holdings are considered
            if (!combinedMap.has(bh.id)) { // If a base holding is not in prevMap (e.g. first load)
                combinedMap.set(bh.id, { price: undefined, exchange: undefined });
            }
        });
        newPricesMapUpdates.forEach((value, key) => { // Overlay with new updates
            combinedMap.set(key, value);
        });
        return combinedMap;
      });


      if (pricesUpdatedCount > 0) {
        setPricesLastUpdated(new Date());
      }

      console.log(`[InvestoTrackApp] Prices updated count: ${pricesUpdatedCount}`);
      console.log(`[InvestoTrackApp] Non-EUR currency warnings:`, nonEurCurrencyWarnings);
      console.log(`[InvestoTrackApp] Not found warnings:`, notFoundWarnings);

      if (pricesUpdatedCount > 0) {
        console.log("[InvestoTrackApp] Toasting: Prices Refreshed");
        toast({ title: "Prices Refreshed", description: `${pricesUpdatedCount} holding(s) updated.` });
      } else if (initialRefreshDoneRef.current || assetsToFetch.length > 0) {
        console.log("[InvestoTrackApp] Toasting: Prices Checked (no EUR updates)");
        // Only show this if not already showing more specific warnings
        if (nonEurCurrencyWarnings.length === 0 && notFoundWarnings.length === 0) {
          toast({ title: "Prices Checked", description: "No new EUR prices were found. They might be current or not found by Yahoo Finance." });
        }
      }

      if (nonEurCurrencyWarnings.length > 0) {
        console.log("[InvestoTrackApp] Toasting: Currency Mismatch");
        toast({
          title: "Currency Mismatch",
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
        console.log("[InvestoTrackApp] Toasting: Price Not Found");
         toast({
          title: "Price Not Found",
          description: (
            <ul className="list-disc pl-5">
              {notFoundWarnings.map((warning, idx) => <li key={idx}>{warning}</li>)}
            </ul>
          ),
          variant: "default",
          duration: 10000,
        });
      }

    } catch (error) {
      console.error("[InvestoTrackApp] Error refreshing prices:", error);
      toast({ title: "Error Refreshing Prices", description: `Could not fetch latest prices. ${error instanceof Error ? error.message : String(error)}`, variant: "destructive" });
    } finally {
      console.log("[InvestoTrackApp] Finished price refresh attempt.");
      setIsRefreshingPrices(false);
    }
  }, [isRefreshingPrices, baseHoldings, toast, currentPricesMap]); // Depends on baseHoldings now


  // Effect 3: Initial automatic price refresh
  useEffect(() => {
    // Use baseHoldings.length to gate initial refresh
    if (baseHoldings.length > 0 && !initialRefreshDoneRef.current && !isRefreshingPrices) {
      console.log("[InvestoTrackApp] Triggering initial automatic price refresh based on baseHoldings.");
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
