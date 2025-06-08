
import { Briefcase, RefreshCw, Loader2, Clock, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AppHeaderProps {
  onRefreshPrices?: () => void;
  isRefreshingPrices?: boolean;
  pricesLastUpdated?: Date | null;
  onViewLogs?: () => void;
  hasLogs?: boolean;
}

export function AppHeader({ 
  onRefreshPrices, 
  isRefreshingPrices, 
  pricesLastUpdated,
  onViewLogs,
  hasLogs
}: AppHeaderProps) {
  return (
    <header className="bg-card border-b border-border shadow-sm sticky top-0 z-40">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center">
          <Briefcase className="h-8 w-8 text-primary mr-3" />
          <h1 className="text-2xl font-headline font-semibold text-foreground">
            InvestoTrack
          </h1>
        </div>
        <div className="flex items-center space-x-4">
          {pricesLastUpdated && (
            <div className="text-xs text-muted-foreground flex items-center">
              <Clock className="mr-1 h-3 w-3" />
              Prices updated: {pricesLastUpdated.toLocaleTimeString()}
            </div>
          )}
          {onViewLogs && (
             <Button
              variant="outline"
              size="sm"
              onClick={onViewLogs}
              disabled={!hasLogs && !isRefreshingPrices} // Disable if no logs and not refreshing
              className="shadow-sm"
            >
              <FileText className="mr-2 h-4 w-4" />
              View Logs
            </Button>
          )}
          {onRefreshPrices && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefreshPrices}
              disabled={isRefreshingPrices}
              className="shadow-sm"
            >
              {isRefreshingPrices ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh Prices
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
