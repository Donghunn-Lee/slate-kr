"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { useState } from "react";
import { Toaster } from "sonner";
import { MarketCalendarProvider } from "@/shared/contexts/MarketCalendarContext";
import type { MarketCalendar } from "@/shared/types/marketCalendar";

type ProvidersProps = {
  calendar: MarketCalendar;
  children: React.ReactNode;
};

export const Providers = ({ calendar, children }: ProvidersProps) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      })
  );

  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem>
      <QueryClientProvider client={queryClient}>
        <MarketCalendarProvider calendar={calendar}>
          {children}
        </MarketCalendarProvider>
      </QueryClientProvider>
      <Toaster richColors position="top-right" />
    </NextThemesProvider>
  );
};
