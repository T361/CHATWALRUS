'use client';

// Shell is now rendered in the layout — this is a passthrough to avoid changing all page call sites.
export default function CompanyShell({
  children,
}: {
  slug?: string;
  companyName?: string;
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
