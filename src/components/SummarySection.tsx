import type { PortfolioHolding } from '@/types/portfolio';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/portfolioUtils';
import { TrendingUp, Coins, Info } from 'lucide-react';

interface SummarySectionProps {
  holdings: PortfolioHolding[];
  newInvestmentAmount?: number;
}

export function SummarySection({ holdings, newInvestmentAmount }: SummarySectionProps) {
  const totalPortfolioValue = holdings.reduce((sum, h) => sum + h.currentAmount, 0);
  const totalTargetValue = holdings.reduce((sum, h) => sum + h.targetBuyAmount, 0);

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
          <span className="text-sm text-muted-foreground font-medium">Total Target Value</span>
          <span className="text-2xl font-semibold text-accent">
            {formatCurrency(totalTargetValue)}
          </span>
        </div>
        {newInvestmentAmount !== undefined && (
          <div className="flex flex-col p-4 bg-secondary/50 rounded-lg shadow">
            <span className="text-sm text-muted-foreground font-medium flex items-center">
              <Coins className="mr-1 h-4 w-4" />
              Available for New Investment
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
