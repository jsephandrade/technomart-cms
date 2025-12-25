import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './components/AuthContext';
import AppRoutes from './components/app/AppRoutes';
import { ThemeProvider } from 'next-themes';
import ErrorBoundary from '@/components/shared/ErrorBoundary';
import OrderAutoAdvanceService from './components/app/OrderAutoAdvanceService';

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider
      attribute="class"
      forcedTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <TooltipProvider>
        <Sonner />
        <AuthProvider>
          <OrderAutoAdvanceService />
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
