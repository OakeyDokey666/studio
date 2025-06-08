
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

type PriceMapEntry = {
  price?: number;
  exchange?: string;
  symbol?: string;
  // Fields for Name Popover
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

  useEffect(() => {
    const initialSetup = initialData.holdings.map(h => ({
      ...h,
      ticker: h.ticker || isinToTickerMap[h.isin] || undefined,
      currentPrice: undefined,
      currentAmount: undefined,
      priceSourceExchange: undefined,
      // Initialize name popover fields
      ter: undefined,
      fundSize: undefined,
      categoryName: undefined,
    }));
    setBaseHoldings(initialSetup);
  }, [initialData.holdings]);

  useEffect(() => {
    if (baseHoldings.length === 0 && initialData.holdings.length === 0) {
        setPortfolioHoldings([]);
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
        // Map name popover fields
        ter: priceInfo?.ter,
        fundSize: priceInfo?.fundSize,
        categoryName: priceInfo?.categoryName,
      };
    });

    const metricsApplied = calculatePortfolioMetrics(holdingsWithLivePrices, newInvestmentAmount, roundingOption);
    setPortfolioHoldings(metricsApplied);

  }, [baseHoldings, currentPricesMap, newInvestmentAmount, roundingOption, initialData.holdings]);


  const handleRefreshPrices = useCallback(async () => {
    if (isRefreshingPrices) {
      console.log("[InvestoTrackApp RB] Price refresh already in progress.");
      return;
    }
    setIsRefreshingPrices(true);
    console.log("[InvestoTrackApp RB] Starting price refresh for baseHoldings:", baseHoldings);
    try {
      const assetsToFetch: FetchStockPricesInput = baseHoldings.map(h => ({
        isin: h.isin,
        id: h.id,
        ticker: h.ticker
      }));

      console.log("[InvestoTrackApp RB] Assets to fetch:", assetsToFetch);

      if (assetsToFetch.length === 0) {
        console.log("[InvestoTrackApp RB] No base holdings to refresh.");
        if (initialRefreshDoneRef.current) {
             toast({ title: "No holdings to refresh", description: "Your portfolio is empty." });
        }
        setIsRefreshingPrices(false);
        return;
      }

      const fetchedPricesData: StockPriceData[] = await fetchStockPrices(assetsToFetch);
      console.log("[InvestoTrackApp RB] Fetched prices raw data from flow:", fetchedPricesData);

      let pricesUpdatedCount = 0;
      let notFoundWarnings: string[] = [];
      const newPricesMapUpdates = new Map<string, PriceMapEntry>();

      fetchedPricesData.forEach(priceData => {
        const holdingFromBase = baseHoldings.find(h => h.id === priceData.id);
        if (holdingFromBase) {
          let entryToSet: PriceMapEntry = {
            exchange: priceData.exchange,
            symbol: priceData.symbol,
            // Name popover fields
            ter: priceData.ter,
            fundSize: priceData.fundSize,
            categoryName: priceData.categoryName,
          };

          if (priceData.currentPrice !== undefined && priceData.currency?.toUpperCase() === 'EUR') {
              pricesUpdatedCount++;
              entryToSet.price = priceData.currentPrice;
              console.log(`[InvestoTrackApp RB] Price updated for ${holdingFromBase.name}: ${priceData.currentPrice} ${priceData.currency}`);
          } else {
            notFoundWarnings.push(`Could not find EUR price for ${holdingFromBase.name} (ISIN: ${holdingFromBase.isin}, Symbol: ${priceData.symbol || holdingFromBase.ticker || 'N/A'}, Reported Exchange: ${priceData.exchange || 'N/A'}, Reported Currency: ${priceData.currency || 'N/A'}).`);
            const existingEntry = currentPricesMap.get(holdingFromBase.id);
            entryToSet.price = existingEntry?.price; 
            console.log(`[InvestoTrackApp RB] No valid EUR price found by flow for ${holdingFromBase.name}. Kept old price: ${existingEntry?.price}`);
          }
          newPricesMapUpdates.set(holdingFromBase.id, entryToSet);
        }
      });

      setCurrentPricesMap(prevMap => {
        const combinedMap = new Map(prevMap);
        baseHoldings.forEach(bh => {
            if (!combinedMap.has(bh.id)) {
                combinedMap.set(bh.id, { /* default empty entry for name popover */ });
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
        if (notFoundWarnings.length === 0) {
          toast({ title: "Prices Checked", description: "No new EUR prices were found or they were already current." });
        }
      }

      if (notFoundWarnings.length > 0) {
         toast({
          title: "Price Not Found During Refresh",
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
      console.error("[InvestoTrackApp RB] Error refreshing prices:", error);
      toast({ title: "Error Refreshing Prices", description: `Could not fetch latest prices. ${error instanceof Error ? error.message : String(error)}`, variant: "destructive" });
    } finally {
      setIsRefreshingPrices(false);
    }
  }, [isRefreshingPrices, baseHoldings, toast, currentPricesMap]);


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
