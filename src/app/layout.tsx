import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "MCP Wales",
  description: "Trusted local and public data in Wales, starting with Cardiff food hygiene ratings and maintained-school profiles.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#f8faf6" }}>
        {children}
      </body>
    </html>
  );
}
