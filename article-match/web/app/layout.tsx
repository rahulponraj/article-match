import "./globals.css";
import { Schibsted_Grotesk } from "next/font/google";
const font = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-sans" });
export const metadata = { title: "Article Match Engine" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body className={`${font.variable} font-sans`}>{children}</body></html>);
}
