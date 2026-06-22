'use client';

import React from 'react';

export const AdminCompanyContext = React.createContext(false);

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
