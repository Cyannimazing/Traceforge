import {createRootMetadata,jsonLd,seoSettings,structuredSiteData} from '@/lib/seo';
import "./globals.css";
import './legal.css';
export const metadata=createRootMetadata();
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-search-indexable={seoSettings().indexable?'true':'false'}>
      <body><script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(structuredSiteData())}}/>{children}</body>
    </html>
  );
}
