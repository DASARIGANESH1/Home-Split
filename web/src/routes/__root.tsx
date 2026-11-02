import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Outlet, createRootRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Layout } from '../components/Layout';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const Route = createRootRoute({
  component: () => {
    const [client] = useState(() => queryClient);
    return (
      <QueryClientProvider client={client}>
        <Layout>
          <Outlet />
        </Layout>
      </QueryClientProvider>
    );
  },
});
