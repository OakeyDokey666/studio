
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
  "LU1812092168": "SEL.PA", // Amundi Stoxx Europe Select Dividend 30 (Corrected)
  "IE00B4K6B022": "50E.PA", // HSBC EURO STOXX 50 (Corrected)
  "IE00BZ4BMM98": "EUHD.PA", // Invesco EURO STOXX High Dividend Low Volatility
  "IE0002XZSHO1": "WPEA.PA", // iShares MSCI World Swap PEA
  "IE00B5M1WJ87": "EUDV.PA" // SPDR S&P Euro Dividend Aristocrats (Corrected)
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
  const [currentPricesMap, setCurrentPricesMap] = useState<Map<string, {price: number, exchange?: string, regularMarketChange?: number, regularMarketChangePercent?: number}>>(new Map());

  // Effect 1: Set up baseHoldings from initialData, clearing dynamic price fields
  useEffect(() => {
    const initialSetup = initialData.holdings.map(h => ({
      ...h,
      ticker: h.ticker || isinToTickerMap[h.isin] || undefined,
      currentPrice: undefined, // Explicitly undefined until fetched
      currentAmount: undefined, // Explicitly undefined until calculated from fetched price
      priceSourceExchange: undefined, // Explicitly undefined until fetched
      regularMarketChange: undefined,
      regularMarketChangePercent: undefined,
    }));
    setBaseHoldings(initialSetup);
  }, [initialData.holdings]); // Only re-run if initialData.holdings changes

  // Effect 2: Main calculation effect for portfolioHoldings
  // Runs when baseHoldings, currentPricesMap, newInvestmentAmount, or roundingOption change
  useEffect(() => {
    if (baseHoldings.length === 0) {
      if (initialData.holdings.length === 0) {
        setPortfolioHoldings([]);
      }
      return;
    }

    // Step 1: Apply live/fetched prices to the base holdings structure
    const holdingsWithLivePrices = baseHoldings.map(h => {
      const priceInfo = currentPricesMap.get(h.id);
      const livePrice = priceInfo?.price;

      return {
        ...h,
        currentPrice: livePrice, 
        currentAmount: livePrice !== undefined ? h.quantity * livePrice : undefined,
        priceSourceExchange: priceInfo?.exchange ?? h.priceSourceExchange,
        regularMarketChange: priceInfo?.regularMarketChange,
        regularMarketChangePercent: priceInfo?.regularMarketChangePercent,
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

      const fetchedPrices: StockPriceData[] = await fetchStockPrices(assetsToFetch);
      console.log("[InvestoTrackApp] Fetched prices raw data:", fetchedPrices);

      let pricesUpdatedCount = 0;
      let nonEurCurrencyWarnings: string[] = [];
      let notFoundWarnings: string[] = [];
      const newPricesMapUpdates = new Map<string, {price: number, exchange?: string, regularMarketChange?: number, regularMarketChangePercent?: number }>();

      fetchedPrices.forEach(priceData => {
        const holdingFromBase = baseHoldings.find(h => h.id === priceData.id);
        if (holdingFromBase) {
          if (priceData.currentPrice !== undefined && priceData.currency) {
            if (priceData.currency.toUpperCase() !== 'EUR') {
              nonEurCurrencyWarnings.push(`Holding ${holdingFromBase.name} (${priceData.symbol || holdingFromBase.isin} on ${priceData.exchange || 'N/A'}) price is in ${priceData.currency}, not EUR. Price not updated.`);
               newPricesMapUpdates.set(holdingFromBase.id, { 
                price: currentPricesMap.get(holdingFromBase.id)?.price ?? undefined, 
                exchange: priceData.exchange,
                regularMarketChange: currentPricesMap.get(holdingFromBase.id)?.regularMarketChange ?? priceData.regularMarketChange, // Keep old or take new if EUR
                regularMarketChangePercent: currentPricesMap.get(holdingFromBase.id)?.regularMarketChangePercent ?? priceData.regularMarketChangePercent, // Keep old or take new if EUR
              });
            } else {
              pricesUpdatedCount++;
              newPricesMapUpdates.set(holdingFromBase.id, { 
                price: priceData.currentPrice, 
                exchange: priceData.exchange,
                regularMarketChange: priceData.regularMarketChange,
                regularMarketChangePercent: priceData.regularMarketChangePercent,
              });
            }
          } else {
            notFoundWarnings.push(`Could not find EUR price for ${holdingFromBase.name} (ISIN: ${holdingFromBase.isin}, Ticker: ${priceData.symbol || holdingFromBase.ticker || 'N/A'}, Exchange: ${priceData.exchange || 'N/A'}).`);
            newPricesMapUpdates.set(holdingFromBase.id, { 
              price: currentPricesMap.get(holdingFromBase.id)?.price ?? undefined, 
              exchange: priceData.exchange,
              regularMarketChange: currentPricesMap.get(holdingFromBase.id)?.regularMarketChange ?? priceData.regularMarketChange,
              regularMarketChangePercent: currentPricesMap.get(holdingFromBase.id)?.regularMarketChangePercent ?? priceData.regularMarketChangePercent,
            });
          }
        }
      });
      
      setCurrentPricesMap(prevMap => {
        const combinedMap = new Map(prevMap); 
        baseHoldings.forEach(bh => { 
            if (!combinedMap.has(bh.id)) { 
                combinedMap.set(bh.id, { price: undefined, exchange: undefined, regularMarketChange: undefined, regularMarketChangePercent: undefined });
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
          toast({ title: "Prices Checked", description: "No new EUR prices were found. They might be current or not found by Yahoo Finance." });
        }
      }

      if (nonEurCurrencyWarnings.length > 0) {
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
