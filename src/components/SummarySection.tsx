
import type { PortfolioHolding } from '@/types/portfolio';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/portfolioUtils';
import { TrendingUp, Coins, Target } from 'lucide-react'; // Updated Icon

interface SummarySectionProps {
  holdings: PortfolioHolding[];
  newInvestmentAmount?: number;
}

export function SummarySection({ holdings, newInvestmentAmount }: SummarySectionProps) {
  const totalPortfolioValue = holdings.reduce((sum, h) => sum + (h.currentAmount ?? 0), 0);
  
  // New calculation for Total Target Value
  const totalTargetValue = holdings.reduce((sum, h) => {
    const price = h.currentPrice ?? 0;
    const qtyToBuy = h.quantityToBuyFromNewInvestment ?? 0;
    return sum + (price * qtyToBuy);
  }, 0);

  // Determine the label for the "target value" based on whether newInvestmentAmount is present
  const targetValueLabel = newInvestmentAmount && newInvestmentAmount > 0 
    ? "Value of New Shares to Buy" 
    : "Original Target Value (from CSV)";

  // If newInvestmentAmount is not present or zero, revert to old calculation for display
  const displayTargetValue = newInvestmentAmount && newInvestmentAmount > 0
    ? totalTargetValue
    : holdings.reduce((sum, h) => sum + h.targetBuyAmount, 0);

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl font-headline flex items-center">
          <TrendingUp className="mr-2 h-6 w-6 text-primary" />
          Portfolio Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        <div className="flex flex-col p-4 bg-secondary/50 rounded-lg shadow">
          <span className="text-sm text-muted-foreground font-medium">Total Current Value</span>
          <span className="text-2xl font-semibold text-primary">
            {formatCurrency(totalPortfolioValue)}
          </span>
        </div>
        <div className="flex flex-col p-4 bg-secondary/50 rounded-lg shadow">
          <span className="text-sm text-muted-foreground font-medium flex items-center">
            <Target className="mr-1 h-4 w-4 text-accent" /> {/* Using Target icon */}
            {targetValueLabel}
          </span>
          <span className="text-2xl font-semibold text-accent">
            {formatCurrency(displayTargetValue)}
          </span>
        </div>
        {newInvestmentAmount !== undefined && newInvestmentAmount > 0 && (
          <div className="flex flex-col p-4 bg-secondary/50 rounded-lg shadow">
            <span className="text-sm text-muted-foreground font-medium flex items-center">
              <Coins className="mr-1 h-4 w-4" />
              New Investment Planned
            </span>
            <span className="text-2xl font-semibold text-foreground">
              {formatCurrency(newInvestmentAmount)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
