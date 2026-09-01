"use client";

import { SWRConfig } from "swr";

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: true,
        revalidateOnMount: true,
        dedupingInterval: 0,
        shouldRetryOnError: (err: any) => {
          // Never retry on 401 or 403 authorization errors
          if (err?.status === 401 || err?.status === 403) {
            return false;
          }
          return true;
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
