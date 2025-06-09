import { config } from 'dotenv';
config();

// import '@/ai/flows/portfolio-rebalancing-suggestions.ts'; // Removed AI rebalancing
import '@/ai/flows/fetch-stock-prices-flow.ts';
