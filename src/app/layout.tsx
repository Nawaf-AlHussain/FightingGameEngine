import type { Metadata } from "next";
import "@/styles/game.css";

export const metadata: Metadata = {
  title: "Fighting Game Engine",
  description: "Browser-based 2D fighting game powered by MUGEN + WebAssembly",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}