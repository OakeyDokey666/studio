
'use client';

import type { PortfolioHolding, RoundingOption } from '@/types/portfolio';
import type { PortfolioRebalancingInput } from '@/ai/flows/portfolio-rebalancing-suggestions';
import React, { useState, useEffect } from 'react';
import { getRebalancingSuggestions } from '@/ai/flows/portfolio-rebalancing-suggestions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Brain, Loader2, Lightbulb } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

interface RebalanceAdvisorProps {
  holdings: PortfolioHolding[];
  newInvestmentAmount?: number;
  setNewInvestmentAmount: (value?: number) => void;
  roundingOption: RoundingOption;
  setRoundingOption: (value: RoundingOption) => void;
}

export function RebalanceAdvisor({ 
  holdings, 
  newInvestmentAmount,
  setNewInvestmentAmount,
  roundingOption,
  setRoundingOption
}: RebalanceAdvisorProps) {
  const [suggestions, setSuggestions] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Local state for the input field to allow typing, then sync with parent on blur or valid change
  const [localNewInvestment, setLocalNewInvestment] = useState<string>(newInvestmentAmount?.toString() ?? '');

  useEffect(() => {
    setLocalNewInvestment(newInvestmentAmount?.toString() ?? '');
  }, [newInvestmentAmount]);

  const handleNewInvestmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalNewInvestment(e.target.value);
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0) {
      setNewInvestmentAmount(val);
    } else if (e.target.value.trim() === '') {
      setNewInvestmentAmount(undefined);
    }
  };
  
  const handleNewInvestmentBlur = () => {
    const val = parseFloat(localNewInvestment);
    if (!isNaN(val) && val >= 0) {
        setNewInvestmentAmount(val);
    } else if (localNewInvestment.trim() === '') {
        setNewInvestmentAmount(undefined);
    } else {
        // If invalid, reset local input to parent's state or clear
        setLocalNewInvestment(newInvestmentAmount?.toString() ?? '');
    }
  };


  const handleGetSuggestions = async () => {
    setIsLoading(true);
    setError(null);
    setSuggestions(null);

    const investmentAmountForAI = newInvestmentAmount; // Use the validated parent state

    if (localNewInvestment.trim() !== '' && (investmentAmountForAI === undefined || isNaN(investmentAmountForAI))) {
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
        allocationPercentage: h.allocationPercentage ?? 0,
        targetBuyAmount: h.targetBuyAmount, 
        buyPrice: h.buyPrice ?? 0,
        qtyToBuy: h.qtyToBuy ?? 0, // This is from CSV
        actualGrosAmount: h.actualGrosAmount ?? 0,
        isin: h.isin,
      })),
      newInvestmentAmount: investmentAmountForAI, 
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
  

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl font-headline flex items-center">
          <Brain className="mr-2 h-6 w-6 text-primary" />
          AI Rebalance Advisor & New Investment
        </CardTitle>
        <CardDescription>
          Configure new investment details and get AI-powered rebalancing suggestions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="newInvestmentAmount" className="text-sm font-medium">
              New Investment Amount (€) (Optional)
            </Label>
            <Input
              id="newInvestmentAmount"
              type="number"
              value={localNewInvestment}
              onChange={handleNewInvestmentChange}
              onBlur={handleNewInvestmentBlur}
              placeholder="e.g., 1000"
              className="mt-1 shadow-sm"
            />
          </div>
          <div>
            <Label className="text-sm font-medium">Quantity Rounding (for New Inv.)</Label>
            <RadioGroup
              value={roundingOption}
              onValueChange={(value) => setRoundingOption(value as RoundingOption)}
              className="mt-2 flex space-x-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="up" id="roundUp" />
                <Label htmlFor="roundUp">Up</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="down" id="roundDown" />
                <Label htmlFor="roundDown">Down</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="classic" id="roundClassic" />
                <Label htmlFor="roundClassic">Classic</Label>
              </div>
            </RadioGroup>
          </div>
        </div>
        <Button onClick={handleGetSuggestions} disabled={isLoading || holdings.length === 0} className="w-full sm:w-auto">
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Lightbulb className="mr-2 h-4 w-4" />
          )}
          Get AI Rebalancing Suggestions
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
