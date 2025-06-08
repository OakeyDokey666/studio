'use client';

import type { PortfolioHolding } from '@/types/portfolio';
import type { PortfolioRebalancingInput } from '@/ai/flows/portfolio-rebalancing-suggestions';
import React, { useState, useEffect } from 'react';
import { getRebalancingSuggestions } from '@/ai/flows/portfolio-rebalancing-suggestions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, Loader2, Lightbulb } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

interface RebalanceAdvisorProps {
  holdings: PortfolioHolding[];
  initialNewInvestmentAmount?: number;
}

export function RebalanceAdvisor({ holdings, initialNewInvestmentAmount = 0 }: RebalanceAdvisorProps) {
  const [newInvestment, setNewInvestment] = useState<string>(initialNewInvestmentAmount.toString());
  const [suggestions, setSuggestions] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleGetSuggestions = async () => {
    setIsLoading(true);
    setError(null);
    setSuggestions(null);

    const investmentAmount = parseFloat(newInvestment);
    if (isNaN(investmentAmount) && newInvestment.trim() !== '') {
      setError("Please enter a valid number for the investment amount.");
      setIsLoading(false);
      return;
    }
    
    const aiInput: PortfolioRebalancingInput = {
      holdings: holdings.map(h => ({
        name: h.name,
        quantity: h.quantity,
        currentPrice: h.currentPrice,
        currentAmount: h.currentAmount,
        objective: h.objective,
        type: h.type,
        potentialIncome: h.potentialIncome,
        allocationPercentage: h.allocationPercentage ?? 0, // Ensure this is current allocation
        targetBuyAmount: h.targetBuyAmount, // This is target value for the holding
        buyPrice: h.buyPrice ?? 0,
        qtyToBuy: h.qtyToBuy ?? 0,
        actualGrosAmount: h.actualGrosAmount ?? 0,
        isin: h.isin,
      })),
      newInvestmentAmount: investmentAmount > 0 ? investmentAmount : undefined,
    };

    try {
      const result = await getRebalancingSuggestions(aiInput);
      setSuggestions(result.suggestions);
      toast({
        title: "Rebalancing Suggestions Generated",
        description: "AI has provided portfolio advice.",
      });
    } catch (e) {
      console.error("Error getting rebalancing suggestions:", e);
      setError("Failed to generate rebalancing suggestions. Please try again.");
       toast({
        title: "Error",
        description: "Could not generate rebalancing suggestions.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Effect to update local state if initialNewInvestmentAmount changes (e.g. from parent)
  useEffect(() => {
    setNewInvestment(initialNewInvestmentAmount.toString());
  }, [initialNewInvestmentAmount]);


  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl font-headline flex items-center">
          <Brain className="mr-2 h-6 w-6 text-primary" />
          AI Rebalance Advisor
        </CardTitle>
        <CardDescription>
          Get AI-powered suggestions to rebalance your portfolio based on your holdings and objectives.
          Optionally, include a new investment amount.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="newInvestmentAmount" className="text-sm font-medium">
            New Investment Amount (Optional)
          </Label>
          <Input
            id="newInvestmentAmount"
            type="number"
            value={newInvestment}
            onChange={(e) => setNewInvestment(e.target.value)}
            placeholder="e.g., 1000"
            className="mt-1 shadow-sm"
          />
        </div>
        <Button onClick={handleGetSuggestions} disabled={isLoading} className="w-full sm:w-auto">
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Lightbulb className="mr-2 h-4 w-4" />
          )}
          Get Suggestions
        </Button>
      </CardContent>
      <CardFooter className="flex flex-col items-start space-y-4">
        {error && (
          <Alert variant="destructive" className="w-full">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {suggestions && (
          <div className="w-full p-4 border border-border rounded-lg bg-secondary/30 shadow">
            <h3 className="text-lg font-semibold mb-2 text-foreground font-headline">Rebalancing Suggestions:</h3>
            <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap overflow-x-auto">
              {suggestions.split('\n').map((line, index) => (
                <p key={index} className="mb-1 last:mb-0">{line}</p>
              ))}
            </div>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
