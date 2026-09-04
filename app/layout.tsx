import type { Metadata } from 'next';
import { Archivo_Black, Caveat, IBM_Plex_Mono, Public_Sans } from 'next/font/google';
import './globals.css';

const display = Archivo_Black({ variable: '--font-display-face', subsets: ['latin'], weight: '400' });
const body = Public_Sans({ variable: '--font-body-face', subsets: ['latin'] });
const data = IBM_Plex_Mono({ variable: '--font-data-face', subsets: ['latin'], weight: ['400', '500', '600'] });
const script = Caveat({ variable: '--font-script-face', subsets: ['latin'], weight: ['600', '700'] });

export const metadata: Metadata = {
  title: { default: 'Students Feeding Students', template: '%s · SFS' },
  description: 'Students Feeding Students Mission Control and public impact dashboard.',
  icons: { icon: '/sfs-logo2.png', apple: '/sfs-logo2.png' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${data.variable} ${script.variable}`}>{children}</body>
    </html>
  );
}
