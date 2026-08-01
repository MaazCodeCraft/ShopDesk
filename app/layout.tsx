import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "ShopDesk — Payments & Notifications",
    description: "Electricity payment records and customer SMS notifications for your printing shop.",
    icons: { icon: "/favicon.svg" },
    openGraph: { title: "ShopDesk — Payments & Notifications", description: "Simple payment proof and customer notifications.", images: [{ url: image, width: 1732, height: 909 }] },
    twitter: { card: "summary_large_image", title: "ShopDesk — Payments & Notifications", description: "Simple payment proof and customer notifications.", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
