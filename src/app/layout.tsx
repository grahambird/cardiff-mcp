import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Cardiff MCP",
  description: "Read-only access to useful public data about Cardiff, Wales.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 760, margin: "3rem auto", padding: "0 1rem", lineHeight: 1.5 }}>
        {children}
      </body>
    </html>
  );
}
