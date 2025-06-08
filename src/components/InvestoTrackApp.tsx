'use client';

import type { PortfolioHolding, ParsedCsvData } from '@/types/portfolio';
import React, { useState, useEffect, useCallback } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { SummarySection } from '@/components/SummarySection';
import { HoldingsTable } from '@/components/HoldingsTable';
import { RebalanceAdvisor } from '@/components/RebalanceAdvisor';
import { calculatePortfolioMetrics } from '@/lib/portfolioUtils';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal } from "lucide-react";

interface InvestoTrackAppProps {
  initialData: ParsedCsvData;
}

export function InvestoTrackApp({ initialData }: InvestoTrackAppProps) {
  const [portfolioHoldings, setPortfolioHoldings] = useState<PortfolioHolding[]>([]);
  const [newInvestmentAmount, setNewInvestmentAmount] = useState<number | undefined>(initialData.initialNewInvestmentAmount);
  const [csvErrors, setCsvErrors] = useState<string[]>(initialData.csvErrors || []);

  const processHoldings = useCallback((holdingsToProcess: PortfolioHolding[]) => {
    const metricsApplied = calculatePortfolioMetrics(holdingsToProcess);
    setPortfolioHoldings(metricsApplied);
  }, []);

  useEffect(() => {
    processHoldings(initialData.holdings);
  }, [initialData.holdings, processHoldings]);

  // Placeholder for real-time price updates simulation
  // In a real app, this would fetch prices from an API and update holdings
  // For now, it just re-processes existing data if needed.
  // const refreshPrices = () => {
  //   // Simulate fetching new prices - for now, just re-calculate
  //   // In a real app: fetch new prices, update holding.currentPrice, then:
  //   const updatedHoldings = portfolioHoldings.map(h => ({
  //     ...h,
  //     // currentPrice: newFetchedPrice, // Example
  //     currentAmount: h.quantity * h.currentPrice, // Recalculate amount
  //   }));
  //   processHoldings(updatedHoldings); 
  //   toast({ title: "Prices 'Refreshed'", description: "Using existing data for simulation." });
  // };


  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader />
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
