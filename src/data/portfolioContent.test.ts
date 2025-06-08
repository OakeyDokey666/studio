import { initialPortfolioData } from '@/data/portfolioContent';
import { rawCsvData } from '@/data/portfolioContent'; // For context if needed for future tests
import { parsePortfolioCSV } from '@/lib/csvParser';

describe('Initial Portfolio Data Processing', () => {
  describe('Using pre-parsed initialPortfolioData', () => {
    it('should contain exactly 6 holdings', () => {
      // This test relies on the `initialPortfolioData` being correctly parsed at import time.
      // The raw CSV has 6 holding lines, a header, a total line, and a rounding line.
      // The parsePortfolioCSV function filters these to produce actual holdings.
      expect(initialPortfolioData.holdings).toHaveLength(6);
    });

    it('should have initialNewInvestmentAmount parsed correctly', () => {
      // Based on the rawCsvData string: "Total,"€207.740,00",,,,Enter New investment amount ,1000,,..."
      expect(initialPortfolioData.initialNewInvestmentAmount).toBe(1000);
    });

    it('should correctly parse the name of the first holding', () => {
      if (initialPortfolioData.holdings.length > 0) {
        expect(initialPortfolioData.holdings[0].name).toBe('Amundi PEA MSCI Emerging Asia ESG Leaders');
      } else {
        // Fail the test explicitly if there are no holdings, though the length test should catch this.
        throw new Error("No holdings found in initialPortfolioData to test the first holding's name.");
      }
    });

     it('should correctly parse the ISIN of the last holding', () => {
      if (initialPortfolioData.holdings.length === 6) {
        expect(initialPortfolioData.holdings[5].isin).toBe('IE00B5M1WJ87');
      } else {
        throw new Error(`Expected 6 holdings to test the last one, but found ${initialPortfolioData.holdings.length}.`);
      }
    });
  });

  describe('Directly testing parsePortfolioCSV with rawCsvData', () => {
    const parsedDirectly = parsePortfolioCSV(rawCsvData);

    it('should parse to exactly 6 holdings when directly parsing rawCsvData', () => {
      expect(parsedDirectly.holdings).toHaveLength(6);
    });

    it('should parse initialNewInvestmentAmount correctly when directly parsing rawCsvData', () => {
      expect(parsedDirectly.initialNewInvestmentAmount).toBe(1000);
    });

    it('should have no CSV errors from the raw data', () => {
      expect(parsedDirectly.csvErrors).toEqual([]);
    });
  });
});
