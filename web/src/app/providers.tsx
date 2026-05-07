"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { useState } from "react";
import { Toaster } from "sonner";

type ProvidersProps = {
  children: React.ReactNode;
};

export const Providers = ({ children }: ProvidersProps) => {
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
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      <Toaster richColors />
    </NextThemesProvider>
  );
};
