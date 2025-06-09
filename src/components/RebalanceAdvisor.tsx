
'use client';

import type { RoundingOption } from '@/types/portfolio';
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Coins } from 'lucide-react'; // Using Coins icon for investment
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

interface RebalanceAdvisorProps {
  newInvestmentAmount?: number;
  setNewInvestmentAmount: (value?: number) => void;
  roundingOption: RoundingOption;
  setRoundingOption: (value: RoundingOption) => void;
}

export function RebalanceAdvisor({ 
  newInvestmentAmount,
  setNewInvestmentAmount,
  roundingOption,
  setRoundingOption
}: RebalanceAdvisorProps) {
  const [localNewInvestment, setLocalNewInvestment] = useState<string>(newInvestmentAmount?.toString() ?? '');
  const [inputError, setInputError] = useState<string | null>(null); // For local input validation

  useEffect(() => {
    setLocalNewInvestment(newInvestmentAmount?.toString() ?? '');
  }, [newInvestmentAmount]);

  const handleNewInvestmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setLocalNewInvestment(inputValue);
    setInputError(null); // Clear error on change

    if (inputValue.trim() === '') {
      setNewInvestmentAmount(undefined);
      return;
    }
    
    const val = parseFloat(inputValue);
    if (!isNaN(val) && val >= 0) {
      setNewInvestmentAmount(val);
    } else {
      // Don't set parent state if invalid, wait for blur or indicate error
      // Potentially set an input error state here if immediate feedback is desired
    }
  };
  
  const handleNewInvestmentBlur = () => {
    const val = parseFloat(localNewInvestment);
    if (localNewInvestment.trim() === '') {
        setNewInvestmentAmount(undefined);
        setInputError(null);
    } else if (!isNaN(val) && val >= 0) {
        setNewInvestmentAmount(val);
        setInputError(null);
    } else {
        setInputError("Please enter a valid positive number for the investment amount.");
        // Optionally revert local input to parent's state or keep invalid input for user to correct
        // setLocalNewInvestment(newInvestmentAmount?.toString() ?? '');
    }
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl font-headline flex items-center">
          <Coins className="mr-2 h-6 w-6 text-primary" /> {/* Changed icon */}
          New Investment & Rounding Options
        </CardTitle>
        <CardDescription>
          Configure your new investment amount and how quantities should be rounded.
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
              aria-invalid={!!inputError}
              aria-describedby={inputError ? "investment-error" : undefined}
            />
            {inputError && (
                <p id="investment-error" className="text-sm text-destructive mt-1">{inputError}</p>
            )}
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
      </CardContent>
      {/* CardFooter is removed as it was only for AI suggestions/errors */}
    </Card>
  );
}
