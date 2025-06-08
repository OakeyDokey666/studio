
'use client';

import type { PortfolioHolding, ParsedCsvData } from '@/types/portfolio';
import type { FetchStockPricesInput, StockPriceData } from '@/ai/flows/fetch-stock-prices-flow';
import React, { useState, useEffect, useCallback } from 'react';
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

// ISIN to Ticker mapping based on user input
const isinToTickerMap: Record<string, string> = {
  "FR0013412012": "PAASI.PA", // Assuming .PA for Euronext Paris
  "LU1812092168": "SEL.AS",  // Assuming .AS for Euronext Amsterdam
  "IE00B4K6B022": "E50E.DE", // Assuming .DE for XETRA or a major German exchange for Euro Stoxx 50
  "IE00BZ4BMM98": "EUHD.DE", // Assuming .DE
  "IE0002XZSHO1": "WPEA.MI", // Assuming .MI for Borsa Italiana or a relevant exchange for World PEA
  "IE00B5M1WJ87": "EUDV.AS"  // Assuming .AS for Euronext Amsterdam
};


export function InvestoTrackApp({ initialData }: InvestoTrackAppProps) {
  const [portfolioHoldings, setPortfolioHoldings] = useState<PortfolioHolding[]>([]);
  const [newInvestmentAmount, setNewInvestmentAmount] = useState<number | undefined>(initialData.initialNewInvestmentAmount);
  const [csvErrors, setCsvErrors] = useState<string[]>(initialData.csvErrors || []);
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [pricesLastUpdated, setPricesLastUpdated] = useState<Date | null>(null);
  const { toast } = useToast();

  const processHoldings = useCallback((holdingsToProcess: PortfolioHolding[]) => {
    const enrichedHoldings = holdingsToProcess.map(h => ({
      ...h,
      ticker: h.ticker || isinToTickerMap[h.isin] || undefined
    }));
    const metricsApplied = calculatePortfolioMetrics(enrichedHoldings);
    setPortfolioHoldings(metricsApplied);
  }, []);

  useEffect(() => {
    // Enrich with tickers before processing
    const holdingsWithInitialTickers = initialData.holdings.map(h => ({
        ...h,
        ticker: h.ticker || isinToTickerMap[h.isin] || undefined
    }));
    processHoldings(holdingsWithInitialTickers);
  }, [initialData.holdings, processHoldings]);

  const handleRefreshPrices = async () => {
    setIsRefreshingPrices(true);
    try {
      const assetsToFetch: FetchStockPricesInput = portfolioHoldings.map(h => ({ 
        isin: h.isin, 
        id: h.id,
        ticker: h.ticker || isinToTickerMap[h.isin] // Use holding's ticker if present, else from map
      }));

      if (assetsToFetch.length === 0) {
        toast({ title: "No holdings to refresh", description: "Your portfolio is empty." });
        setIsRefreshingPrices(false);
        return;
      }

      const fetchedPrices: StockPriceData[] = await fetchStockPrices(assetsToFetch);
      
      let pricesUpdatedCount = 0;
      let nonEurCurrencyWarnings: string[] = [];
      let notFoundWarnings: string[] = [];

      const updatedHoldings = portfolioHoldings.map(holding => {
        const priceData = fetchedPrices.find(p => p.id === holding.id);
        if (priceData) {
          if (priceData.currentPrice !== undefined && priceData.currency) {
            if (priceData.currency.toUpperCase() !== 'EUR') {
              nonEurCurrencyWarnings.push(`Holding ${holding.name} (${priceData.symbol || holding.isin}) price is in ${priceData.currency}, not EUR. Price not updated.`);
              return holding; 
            }
            pricesUpdatedCount++;
            return {
              ...holding,
              currentPrice: priceData.currentPrice,
              currentAmount: holding.quantity * priceData.currentPrice,
              // Potentially update ticker if a more accurate one was found by Yahoo
              ticker: priceData.symbol || holding.ticker, 
            };
          } else {
            // Price or currency not found for this holding
            notFoundWarnings.push(`Could not find EUR price for ${holding.name} (ISIN: ${holding.isin}, Ticker: ${holding.ticker || 'N/A'}).`);
          }
        }
        return holding;
      });

      processHoldings(updatedHoldings);
      setPricesLastUpdated(new Date());
      
      if (pricesUpdatedCount > 0) {
        toast({ title: "Prices Refreshed", description: `${pricesUpdatedCount} holding(s) updated.` });
      } else {
         toast({ title: "Prices Checked", description: "No EUR prices were updated. They might be current or not found." });
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
      console.error("Error refreshing prices:", error);
      toast({ title: "Error Refreshing Prices", description: `Could not fetch latest prices. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
    } finally {
      setIsRefreshingPrices(false);
    }
  };


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
