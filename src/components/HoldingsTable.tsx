
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
import { ArrowUpDown, Landmark, Target, PieChart, Info, Percent, Hash, ListTree, Edit3, CreditCard, Building2, Coins, PackagePlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

interface HoldingsTableProps {
  holdings: PortfolioHolding[];
}

type SortKey = keyof PortfolioHolding | 'allocationDifference';
type SortDirection = 'asc' | 'desc';

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
        } else {
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

  const renderPriceCell = (holding: PortfolioHolding) => {
    const priceDisplay = formatCurrency(holding.currentPrice);
    return holding.currentPrice === undefined 
      ? <span className="text-muted-foreground">{priceDisplay}</span>
      : <span className="text-right">{priceDisplay}</span>;
  };

  const renderNameCell = (holding: PortfolioHolding) => {
    return <span className="font-medium text-left whitespace-nowrap">{holding.name}</span>;
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
