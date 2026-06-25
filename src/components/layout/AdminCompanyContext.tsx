'use client';

import React from 'react';

// null = context not yet resolved (prevents flash before hydration)
export const AdminCompanyContext = React.createContext<boolean | null>(null);

export function AdminCompanyProvider({
  isAdmin,
  children,
}: {
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  return (
    <AdminCompanyContext.Provider value={isAdmin}>
      {children}
    </AdminCompanyContext.Provider>
  );
}
