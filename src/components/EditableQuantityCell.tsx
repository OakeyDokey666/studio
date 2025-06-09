'use client';

import React, { useState, useEffect } from 'react';
import type { PortfolioHolding } from '@/types/portfolio';
import { Input } from '@/components/ui/input';
import { useToast } from "@/hooks/use-toast";

interface EditableQuantityCellProps {
  holding: PortfolioHolding;
  onUpdateQuantity: (holdingId: string, newQuantity: number) => void;
}

export function EditableQuantityCell({ holding, onUpdateQuantity }: EditableQuantityCellProps) {
  const [inputValue, setInputValue] = useState(holding.quantity.toString());
  const { toast } = useToast();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleBlur = () => {
    const numValue = parseFloat(inputValue);
    if (!isNaN(numValue) && numValue >= 0) {
      if (numValue !== holding.quantity) { // Only call update if value actually changed
        onUpdateQuantity(holding.id, numValue);
      }
    } else {
      // Revert to original value if input is invalid and not empty
      setInputValue(holding.quantity.toString());
      if (inputValue.trim() !== "") { // Avoid toast if field was just cleared
        toast({
          title: "Invalid Input",
          description: "Quantity must be a non-negative number. Reverted to original.",
          variant: "destructive",
        });
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur(); // Trigger blur to save/validate
    } else if (e.key === 'Escape') {
      setInputValue(holding.quantity.toString()); // Revert
      (e.target as HTMLInputElement).blur(); // and lose focus
    }
  };

  useEffect(() => {
    // Sync if the prop holding.quantity changes from parent
    // This ensures that if the parent successfully updates the quantity,
    // the input field reflects this new "source of truth".
    // Check if parseFloat(inputValue) is different to avoid resetting during typing
    if (parseFloat(inputValue) !== holding.quantity && !isNaN(holding.quantity)) {
        setInputValue(holding.quantity.toString());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holding.quantity]); // Intentionally only watch holding.quantity from props

  return (
    <Input
      type="number"
      value={inputValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="h-9 w-24 text-right p-2 border rounded-md shadow-sm hover:border-primary focus:border-primary focus:ring-1 focus:ring-primary bg-transparent focus:bg-background"
      min="0"
      step="any" // Allows for decimal quantities if applicable, or "1" for whole numbers
      aria-label={`Quantity for ${holding.name}`}
    />
  );
}
