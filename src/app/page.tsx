import { InvestoTrackApp } from '@/components/InvestoTrackApp';
import { initialPortfolioData } from '@/data/portfolioContent';

export default function HomePage() {
  // In a real app, initialPortfolioData might be fetched from a database or API
  // For this example, it's parsed from a static CSV string

  return <InvestoTrackApp initialData={initialPortfolioData} />;
}
