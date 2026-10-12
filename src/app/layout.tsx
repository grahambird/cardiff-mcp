import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cardiff MCP",
  description: "Connect your AI assistant to public food hygiene ratings and maintained-school directory information for Cardiff, Wales.",
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
