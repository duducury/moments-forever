import type { ReactNode } from "react";

import { AdminSidebar } from "./admin-sidebar";
import shellStyles from "./admin-shell.module.css";

/**
 * Chrome only — each page still gates itself with requireAdminUser() and
 * redirects, exactly as before. That check happens during the same
 * server-render pass as this layout, so a non-admin never actually sees
 * this shell rendered to the client.
 */
export default function AdminLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className={shellStyles.shell}>
      <AdminSidebar />
      <div className={shellStyles.content}>{children}</div>
    </div>
  );
}
