
'use client';

import type { PortfolioHolding } from '@/types/portfolio';
import React, { useState, useMemo } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatPercentage } from '@/lib/portfolioUtils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { 
  ArrowUpDown, Landmark, Target, PieChart, Info, Percent, Hash, ListTree, Edit3, CreditCard, 
  Building2, Coins, PackagePlus, BarChart3, DollarSign, DivideSquare, Sigma, ChevronsUpDown,
  Briefcase, Bookmark // Removed Activity, ArrowUpRight, ArrowDownLeft, Minus
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

interface HoldingsTableProps {
  holdings: PortfolioHolding[];
}

type SortKey = keyof PortfolioHolding | 'allocationDifference' | 'priceSourceExchange' | 'newInvestmentAllocation' | 'quantityToBuyFromNewInvestment'; // Removed 'regularMarketChangePercent'
type SortDirection = 'asc' | 'desc';

const formatLargeNumber = (value?: number): string => {
  if (value === undefined || value === null || isNaN(value)) return 'N/A';
  return value.toLocaleString('en-US'); 
};

const formatRatio = (value?: number): string => {
  if (value === undefined || value === null || isNaN(value)) return 'N/A';
  return value.toFixed(2);
}

const formatTer = (value?: number): string => {
  if (value === undefined || value === null || isNaN(value)) return 'N/A';
  return `${(value * 100).toFixed(2)}%`;
}


export function HoldingsTable({ holdings: data }: HoldingsTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortedAndFilteredHoldings = useMemo(() => {
    let filtered = data.filter(holding =>
      holding.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      holding.isin.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (sortKey) {
      filtered.sort((a, b) => {
        let valA, valB;
        if (sortKey === 'allocationDifference') {
          valA = Math.abs((a.allocationPercentage ?? 0) - (a.targetAllocationPercentage ?? 0));
          valB = Math.abs((b.allocationPercentage ?? 0) - (b.targetAllocationPercentage ?? 0));
        }
        // Removed sorting for 'regularMarketChangePercent'
         else {
           valA = a[sortKey as keyof PortfolioHolding];
           valB = b[sortKey as keyof PortfolioHolding];
        }

        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        }
        if (valA === undefined || valA === null) return sortDirection === 'asc' ? 1 : -1; 
        if (valB === undefined || valB === null) return sortDirection === 'asc' ? -1 : 1; 
        
        return 0;
      });
    }
    return filtered;
  }, [data, searchTerm, sortKey, sortDirection]); 

  const getDeviationSeverity = (current?: number, target?: number): 'low' | 'medium' | 'high' | 'none' => {
    if (current === undefined || target === undefined) return 'none';
    const diff = Math.abs(current - target);
    if (diff > 5) return 'high'; 
    if (diff > 2) return 'medium'; 
    if (diff > 0.5) return 'low'; 
    return 'none';
  };

  const tableHeaders = [
    { key: 'name', label: 'Name', icon: <ListTree className="mr-1 h-4 w-4" /> },
    { key: 'quantity', label: 'Qty', icon: <Hash className="mr-1 h-4 w-4" /> },
    { key: 'currentPrice', label: 'Price (€)', icon: <CreditCard className="mr-1 h-4 w-4" /> },
    // { key: 'regularMarketChangePercent', label: 'Day Change', icon: <Activity className="mr-1 h-4 w-4" /> }, // Removed Day Change header
    { key: 'priceSourceExchange', label: 'Exchange', icon: <Building2 className="mr-1 h-4 w-4" /> },
    { key: 'currentAmount', label: 'Value (€)', icon: <CreditCard className="mr-1 h-4 w-4" /> },
    { key: 'allocationPercentage', label: 'Current Alloc.', icon: <PieChart className="mr-1 h-4 w-4" /> },
    { key: 'targetAllocationPercentage', label: 'Target Alloc.', icon: <Target className="mr-1 h-4 w-4" /> },
    { key: 'newInvestmentAllocation', label: 'New Inv. Alloc. (€)', icon: <Coins className="mr-1 h-4 w-4" /> },
    { key: 'quantityToBuyFromNewInvestment', label: 'Qty to Buy (New Inv.)', icon: <PackagePlus className="mr-1 h-4 w-4" /> },
    { key: 'objective', label: 'Objective', icon: <Edit3 className="mr-1 h-4 w-4" />},
    { key: 'type', label: 'Type', icon: <Landmark className="mr-1 h-4 w-4" /> },
    { key: 'potentialIncome', label: 'Income', icon: <Percent className="mr-1 h-4 w-4" /> },
    { key: 'isin', label: 'ISIN', icon: <Info className="mr-1 h-4 w-4" /> },
  ];

  // renderDayChange function removed

  const renderPriceCell = (holding: PortfolioHolding) => {
    const priceDisplay = formatCurrency(holding.currentPrice);
    if (holding.currentPrice === undefined) {
      return <span className="text-muted-foreground">{priceDisplay}</span>;
    }

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="link" className="p-0 h-auto text-right font-normal text-current hover:text-primary">
            {priceDisplay}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <div className="grid gap-4">
            <div className="space-y-2">
              <h4 className="font-medium leading-none text-foreground">{holding.name} - Price Details</h4>
              <p className="text-sm text-muted-foreground">
                Symbol: {holding.ticker || holding.isin} ({holding.priceSourceExchange || 'N/A'})
              </p>
            </div>
            <div className="grid gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center"><BarChart3 className="mr-2 h-4 w-4" />Volume</span>
                <span>{formatLargeNumber(holding.regularMarketVolume)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center"><BarChart3 className="mr-2 h-4 w-4" />Avg. Volume (10D)</span> 
                {/* Changed icon to BarChart3 as Activity was removed from imports */}
                <span>{formatLargeNumber(holding.averageDailyVolume10Day)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center"><DollarSign className="mr-2 h-4 w-4" />Market Cap</span>
                <span>{formatCurrency(holding.marketCap, holding.marketCap ? 'EUR' : '')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center"><DivideSquare className="mr-2 h-4 w-4" />P/E Ratio</span>
                <span>{formatRatio(holding.trailingPE)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center"><Sigma className="mr-2 h-4 w-4" />EPS (TTM)</span>
                <span>{formatRatio(holding.epsTrailingTwelveMonths)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center"><ChevronsUpDown className="mr-2 h-4 w-4" />52-Week Range</span>
                <span className="text-right">
                  {formatCurrency(holding.fiftyTwoWeekLow)} - {formatCurrency(holding.fiftyTwoWeekHigh)}
                </span>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  const renderNameCell = (holding: PortfolioHolding) => {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="link" className="p-0 h-auto font-medium text-current hover:text-primary text-left whitespace-nowrap">
            {holding.name}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96">
          <div className="grid gap-4">
            <div className="space-y-2">
              <h4 className="font-medium leading-none text-foreground">{holding.name} - Fund Profile</h4>
            </div>
            <div className="grid gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center"><Briefcase className="mr-2 h-4 w-4" />Fund Size (AUM)</span>
                <span>{formatCurrency(holding.fundSize, holding.fundSize ? 'EUR' : '')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center"><Percent className="mr-2 h-4 w-4" />TER (Expense Ratio)</span>
                <span>{formatTer(holding.ter)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center"><Bookmark className="mr-2 h-4 w-4" />Category</span>
                <span>{holding.categoryName || 'N/A'}</span>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  };


  return (
    <div className="space-y-4">
      <Input
        type="text"
        placeholder="Filter by name or ISIN..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="max-w-sm shadow-sm"
      />
      <Card className="shadow-lg">
        <CardContent className="p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {tableHeaders.map(header => (
                <TableHead key={header.key} className="whitespace-nowrap">
                  <Button variant="ghost" onClick={() => handleSort(header.key as SortKey)} className="px-2 py-1 text-xs sm:text-sm">
                    <span className="flex items-center">{header.icon} {header.label}</span>
                    {sortKey === header.key && <ArrowUpDown className="ml-2 h-3 w-3 sm:h-4 sm:w-4" />}
                  </Button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedAndFilteredHoldings.map((holding) => {
              const deviation = getDeviationSeverity(holding.allocationPercentage, holding.targetAllocationPercentage);
              let rowClass = '';
              if (deviation === 'high') rowClass = 'bg-destructive/10 hover:bg-destructive/20';
              else if (deviation === 'medium') rowClass = 'bg-yellow-400/10 hover:bg-yellow-400/20';
              else if (deviation === 'low') rowClass = 'bg-green-400/10 hover:bg-green-400/20';

              return (
                <TableRow key={holding.id} className={cn(rowClass, "transition-colors duration-150")}>
                  <TableCell className="whitespace-nowrap">{renderNameCell(holding)}</TableCell>
                  <TableCell className="text-right">{holding.quantity}</TableCell>
                  <TableCell className="text-right">{renderPriceCell(holding)}</TableCell>
                  {/* Removed cell for Day Change */}
                  <TableCell className="text-center">{holding.priceSourceExchange || 'N/A'}</TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(holding.currentAmount)}</TableCell>
                  <TableCell className="text-right">
                     <Badge variant={
                       deviation === 'high' ? 'destructive' : deviation === 'medium' ? 'secondary' : 'default'
                     } className={cn(
                       deviation === 'medium' && 'bg-yellow-500/80 text-black',
                       'font-mono'
                     )}>
                      {formatPercentage(holding.allocationPercentage)}
                     </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatPercentage(holding.targetAllocationPercentage)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(holding.newInvestmentAllocation)}</TableCell>
                  <TableCell className="text-right">{holding.quantityToBuyFromNewInvestment?.toString() ?? 'N/A'}</TableCell>
                  <TableCell className="whitespace-nowrap">{holding.objective}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{holding.type}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{holding.potentialIncome}</TableCell>
                  <TableCell className="font-mono text-xs">{holding.isin}</TableCell>
                </TableRow>
              );
            })}
             {sortedAndFilteredHoldings.length === 0 && (
              <TableRow>
                <TableCell colSpan={tableHeaders.length} className="h-24 text-center text-muted-foreground">
                  No holdings found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      </CardContent>
      </Card>
    </div>
  );
}

