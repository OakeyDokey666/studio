
'use client';

import type { PortfolioHolding, ParsedCsvData } from '@/types/portfolio';
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

// ISIN to Ticker mapping, prioritizing Euronext
const isinToTickerMap: Record<string, string> = {
  "FR0013412012": "PAASI.PA", // Amundi PEA MSCI Emerging Asia ESG Leaders (Euronext Paris)
  "LU1812092168": "SEL.PA",  // Amundi Stoxx Europe Select Dividend 30 (Euronext Paris) - Corrected
  "IE00B4K6B022": "50E.PA",   // HSBC EURO STOXX 50 UCITS ETF EUR (Euronext Paris) - Corrected
  "IE00BZ4BMM98": "EUHD.PA",  // Invesco EURO STOXX High Dividend Low Volatility (Euronext Paris)
  "IE0002XZSHO1": "WPEA.PA",  // iShares MSCI World Swap PEA UCITS ETF EUR (Euronext Paris)
  "IE00B5M1WJ87": "EUDV.PA"   // SPDR S&P Euro Dividend Aristocrats (Euronext Paris) - Corrected
};


export function InvestoTrackApp({ initialData }: InvestoTrackAppProps) {
  const [portfolioHoldings, setPortfolioHoldings] = useState<PortfolioHolding[]>([]);
  const [newInvestmentAmount, setNewInvestmentAmount] = useState<number | undefined>(initialData.initialNewInvestmentAmount);
  const [csvErrors, setCsvErrors] = useState<string[]>(initialData.csvErrors || []);
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [pricesLastUpdated, setPricesLastUpdated] = useState<Date | null>(null);
  const { toast } = useToast();
  const initialRefreshDoneRef = useRef(false);

  const processHoldings = useCallback((holdingsToProcess: PortfolioHolding[]) => {
    const metricsApplied = calculatePortfolioMetrics(holdingsToProcess);
    setPortfolioHoldings(metricsApplied);
  }, []);

  useEffect(() => {
    // Initialize holdings with undefined prices/amounts until fetched
    const holdingsWithInitialSetup = initialData.holdings.map(h => ({
        ...h,
        ticker: h.ticker || isinToTickerMap[h.isin] || undefined,
        currentPrice: undefined, // Start with undefined price
        currentAmount: undefined,  // Start with undefined amount
        priceSourceExchange: undefined, // Start with undefined exchange
    }));
    processHoldings(holdingsWithInitialSetup);
  }, [initialData.holdings, processHoldings]);

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
        ticker: h.ticker // Ticker should already be set from initial processing or previous fetches
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

      const updatedHoldings = portfolioHoldings.map(holding => {
        const priceData = fetchedPrices.find(p => p.id === holding.id);
        if (priceData) {
          if (priceData.currentPrice !== undefined && priceData.currency) {
            if (priceData.currency.toUpperCase() !== 'EUR') {
              nonEurCurrencyWarnings.push(`Holding ${holding.name} (${priceData.symbol || holding.isin} on ${priceData.exchange || 'N/A'}) price is in ${priceData.currency}, not EUR. Price not updated.`);
              return {
                ...holding, // Keep old price
                priceSourceExchange: priceData.exchange, // Still show the exchange where non-EUR price was found
              };
            }
            pricesUpdatedCount++;
            return {
              ...holding,
              currentPrice: priceData.currentPrice,
              currentAmount: holding.quantity * priceData.currentPrice,
              ticker: priceData.symbol || holding.ticker, // Update ticker if Yahoo found a better one
              priceSourceExchange: priceData.exchange,
            };
          } else {
            notFoundWarnings.push(`Could not find EUR price for ${holding.name} (ISIN: ${holding.isin}, Ticker: ${priceData.symbol || holding.ticker || 'N/A'}, Exchange: ${priceData.exchange || 'N/A'}).`);
            // If price not found, retain existing priceSourceExchange if any, or set from priceData if available
             return { ...holding, priceSourceExchange: priceData.exchange || holding.priceSourceExchange };
          }
        }
        return holding; // Keep existing (potentially undefined) price if no data or error
      });

      processHoldings(updatedHoldings);
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
  }, [portfolioHoldings, processHoldings, toast, isRefreshingPrices]);


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

        <RebalanceAdvisor holdings={portfolioHoldings} initialNewInvestmentAmount={newInvestmentAmount} />
      </main>
      <footer className="py-6 text-center text-sm text-muted-foreground border-t border-border">
        © {new Date().getFullYear()} InvestoTrack. Powered by Firebase Studio.
      </footer>
    </div>
  );
}
