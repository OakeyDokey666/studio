
'use client';

import type { PortfolioHolding, ParsedCsvData } from '@/types/portfolio';
import type { StockPriceData } from '@/ai/flows/fetch-stock-prices-flow';
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

export function InvestoTrackApp({ initialData }: InvestoTrackAppProps) {
  const [portfolioHoldings, setPortfolioHoldings] = useState<PortfolioHolding[]>([]);
  const [newInvestmentAmount, setNewInvestmentAmount] = useState<number | undefined>(initialData.initialNewInvestmentAmount);
  const [csvErrors, setCsvErrors] = useState<string[]>(initialData.csvErrors || []);
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [pricesLastUpdated, setPricesLastUpdated] = useState<Date | null>(null);
  const { toast } = useToast();

  const processHoldings = useCallback((holdingsToProcess: PortfolioHolding[]) => {
    const metricsApplied = calculatePortfolioMetrics(holdingsToProcess);
    setPortfolioHoldings(metricsApplied);
  }, []);

  useEffect(() => {
    processHoldings(initialData.holdings);
  }, [initialData.holdings, processHoldings]);

  const handleRefreshPrices = async () => {
    setIsRefreshingPrices(true);
    try {
      const isinsToFetch = portfolioHoldings.map(h => ({ isin: h.isin, id: h.id }));
      if (isinsToFetch.length === 0) {
        toast({ title: "No holdings to refresh", description: "Your portfolio is empty." });
        setIsRefreshingPrices(false);
        return;
      }

      const fetchedPrices: StockPriceData[] = await fetchStockPrices(isinsToFetch);
      
      let pricesUpdatedCount = 0;
      let nonEurCurrencyWarnings: string[] = [];

      const updatedHoldings = portfolioHoldings.map(holding => {
        const priceData = fetchedPrices.find(p => p.id === holding.id);
        if (priceData && priceData.currentPrice !== undefined) {
          if (priceData.currency && priceData.currency.toUpperCase() !== 'EUR') {
            nonEurCurrencyWarnings.push(`Holding ${holding.name} (${priceData.symbol || holding.isin}) price is in ${priceData.currency}, not EUR. Price not updated.`);
            return holding; // Do not update if currency is not EUR
          }
          pricesUpdatedCount++;
          return {
            ...holding,
            currentPrice: priceData.currentPrice,
            currentAmount: holding.quantity * priceData.currentPrice, // Recalculate amount
          };
        }
        return holding;
      });

      processHoldings(updatedHoldings);
      setPricesLastUpdated(new Date());
      
      if (pricesUpdatedCount > 0) {
        toast({ title: "Prices Refreshed", description: `${pricesUpdatedCount} holding(s) updated.` });
      } else {
         toast({ title: "Prices Checked", description: "No prices were updated. They might be current or not found in EUR." });
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
          duration: 10000, // Show longer
        });
      }

    } catch (error) {
      console.error("Error refreshing prices:", error);
      toast({ title: "Error Refreshing Prices", description: "Could not fetch latest prices.", variant: "destructive" });
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
