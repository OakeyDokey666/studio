
import { parsePortfolioCSV } from '@/lib/csvParser';
import type { ParsedCsvData } from '@/types/portfolio';

export const rawCsvData: string = `Name,Quantity,Current Price euros (euronext),Current amount,Objective ,Type,Potential income,Allocation %,Target buy amount ,Buy Price,Qty to buy,Actual gros amount ,ISIN,Distributes
Amundi PEA MSCI Emerging Asia ESG Leaders,123,10,"€1.230,00",Major asian companies.,Growth,Sell 4%,"10,00 %",100,"24,872",5,"124,36",FR0013412012,
Amundi Stoxx Europe Select Dividend 30 UCITS ETF,585,20,"€11.700,00","Europe(Uk, swiss etc) high dividend. 30 companies.",Dividends,5-6%,"12,00 %",120,"18,987",6,"113,92",LU1812092168,December
HSBC EURO STOXX 50 UCITS ETF EUR,554,30,"€16.620,00",Eurozone 50 blue chip companies.,Growth+Dividends,2% sell + 2.5% divi,"34,00 %",340,"57,6",5,288,IE00B4K6B022,February / August
Invesco EURO STOXX High Dividend Low Volatility,377,40,"€15.080,00",Eurozone high dividend low volatility. 50 companies.,Dividends,5-6%,"12,00 %",120,"30,74",4,"122,96",IE00BZ4BMM98,March / June / Sep / Dec
iShares MSCI World Swap PEA UCITS ETF EUR (Acc),2805,50,"€140.250,00",World developed markets. USA 70%. Europe 16%.,Growth,Sell 4%,"20,00 %",200,"5,4679",36,"196,84",IE0002XZSHO1,
SPDR S&P Euro Dividend Aristocrats UCITS ETF (Dist),1011,20,"€20.220,00",Eurozone high dividend 40 companies.,Dividends,3-4%,"12,00 %",120,"27,801",4,"111,20",IE00B5M1WJ87,
Total,"€207.740,00",,,,Enter New investment amount ,1000,,Use this calculated quantity to buy.,"957,54",,
Qty rounding ,Down,,,`;

export const initialPortfolioData: ParsedCsvData = parsePortfolioCSV(rawCsvData);
