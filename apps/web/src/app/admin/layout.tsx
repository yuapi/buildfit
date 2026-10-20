import type { ReactNode } from 'react';
import { requireAdmin } from '@/lib/admin-auth';

/** 어드민은 색인 대상이 아니다. robots.txt와 별개로 페이지 자체에도 박아 둔다. */
export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return children;
}
