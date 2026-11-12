import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "HIP Lab · Research workspace",
  description: "Human Input Performance Lab research workspace",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
