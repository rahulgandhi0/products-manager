import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'eBay Bulk Lister - Amazon to eBay Product Manager',
  description: 'Scan Amazon ASINs, scrape product data, and export to eBay draft listings',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <Toaster 
          position="top-center" 
          richColors 
          expand={false}
          duration={3000}
        />
      </body>
    </html>
  );
}

