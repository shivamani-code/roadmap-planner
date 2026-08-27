import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { OfflineNotice } from "../components/offline-notice";
import { PlannerProvider } from "../components/planner-provider";

export const metadata: Metadata = {
  title: { default: "StudentOS for JNTUH R25", template: "%s · StudentOS" },
  description:
    "Curriculum-aware academic and career planning for JNTUH R25 B.Tech students in Telangana.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en-IN" data-scroll-behavior="smooth">
      <body>
        <OfflineNotice />
        <PlannerProvider>{children}</PlannerProvider>
      </body>
    </html>
  );
}
