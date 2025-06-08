
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
  const [newInvestmentAmount, setNewInvestmentAmount] = useState<number | undefined>(initialData.initialNewInvestmentAmount);
  const [roundingOption, setRoundingOption] = useState<RoundingOption>('classic');
  const [csvErrors, setCsvErrors] = useState<string[]>(initialData.csvErrors || []);
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [pricesLastUpdated, setPricesLastUpdated] = useState<Date | null>(null);
  const { toast } = useToast();
  const initialRefreshDoneRef = useRef(false);
  const [currentPricesMap, setCurrentPricesMap] = useState<Map<string, {price: number, exchange?: string}>>(new Map());

  const processAndSetHoldings = useCallback((
    holdingsToProcess: PortfolioHolding[],
    currentNewInvestmentAmount?: number,
    currentRoundingOption?: RoundingOption,
    pricesMap?: Map<string, {price: number, exchange?: string}>
  ) => {
    const holdingsWithPrices = holdingsToProcess.map(h => {
      const priceInfo = pricesMap?.get(h.id);
      return {
        ...h,
        currentPrice: priceInfo?.price ?? h.currentPrice, // Use map price if available, else keep existing
        currentAmount: priceInfo?.price !== undefined ? h.quantity * priceInfo.price : h.currentAmount,
        priceSourceExchange: priceInfo?.exchange ?? h.priceSourceExchange,
      };
    });
    const metricsApplied = calculatePortfolioMetrics(holdingsWithPrices, currentNewInvestmentAmount, currentRoundingOption);
    setPortfolioHoldings(metricsApplied);
  }, []);


  useEffect(() => {
    const holdingsWithInitialSetup = initialData.holdings.map(h => ({
        ...h,
        ticker: h.ticker || isinToTickerMap[h.isin] || undefined,
        currentPrice: undefined, 
        currentAmount: undefined, 
        priceSourceExchange: undefined, 
    }));
    // Initial processing without new investment calculations yet, as prices are not fetched
    processAndSetHoldings(holdingsWithInitialSetup, newInvestmentAmount, roundingOption, currentPricesMap);
  }, [initialData.holdings, processAndSetHoldings]); // Removed newInvestmentAmount, roundingOption, currentPricesMap as they trigger re-calc below


  useEffect(() => {
    // This effect recalculates new investment allocations when relevant states change
    processAndSetHoldings(portfolioHoldings, newInvestmentAmount, roundingOption, currentPricesMap);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newInvestmentAmount, roundingOption, currentPricesMap, processAndSetHoldings]); // portfolioHoldings is implicitly handled by processAndSetHoldings


  const handleRefreshPrices = useCallback(async () => {
    if (isRefreshingPrices) {
      console.log("[InvestoTrackApp] Price refresh already in progress.");
      return;
    }
    setIsRefreshingPrices(true);
    console.log("[InvestoTrackApp] Starting price refresh...");
    try {
      const assetsToFetch: FetchStockPricesInput = portfolioHoldings.map(h => ({
        isin: h.isin,
        id: h.id,
        ticker: h.ticker 
      }));

      console.log("[InvestoTrackApp] Assets to fetch:", assetsToFetch);

      if (assetsToFetch.length === 0) {
        console.log("[InvestoTrackApp] No holdings to refresh.");
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
      const newPricesMap = new Map<string, {price: number, exchange?: string}>();

      fetchedPrices.forEach(priceData => {
        const holding = portfolioHoldings.find(h => h.id === priceData.id);
        if (holding) {
          if (priceData.currentPrice !== undefined && priceData.currency) {
            if (priceData.currency.toUpperCase() !== 'EUR') {
              nonEurCurrencyWarnings.push(`Holding ${holding.name} (${priceData.symbol || holding.isin} on ${priceData.exchange || 'N/A'}) price is in ${priceData.currency}, not EUR. Price not updated.`);
               // Store exchange even if non-EUR for display
              newPricesMap.set(holding.id, { price: currentPricesMap.get(holding.id)?.price ?? holding.currentPrice, exchange: priceData.exchange });
            } else {
              pricesUpdatedCount++;
              newPricesMap.set(holding.id, { price: priceData.currentPrice, exchange: priceData.exchange });
            }
          } else {
            notFoundWarnings.push(`Could not find EUR price for ${holding.name} (ISIN: ${holding.isin}, Ticker: ${priceData.symbol || holding.ticker || 'N/A'}, Exchange: ${priceData.exchange || 'N/A'}).`);
            // Store exchange even if price not found
            newPricesMap.set(holding.id, { price: currentPricesMap.get(holding.id)?.price ?? holding.currentPrice, exchange: priceData.exchange });
          }
        }
      });
      
      setCurrentPricesMap(prevMap => new Map([...Array.from(prevMap.entries()), ...Array.from(newPricesMap.entries())]));

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
        toast({ title: "Prices Checked", description: "No EUR prices were updated. They might be current or not found by Yahoo Finance." });
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
  }, [portfolioHoldings, toast, isRefreshingPrices, currentPricesMap, processAndSetHoldings]);


  useEffect(() => {
    if (portfolioHoldings.length > 0 && !initialRefreshDoneRef.current && !isRefreshingPrices) {
      console.log("[InvestoTrackApp] Triggering initial automatic price refresh.");
      handleRefreshPrices();
      initialRefreshDoneRef.current = true;
    }
  }, [portfolioHoldings, handleRefreshPrices, isRefreshingPrices]);


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
