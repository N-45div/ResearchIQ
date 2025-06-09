import './globals.css'
import { Geist, Geist_Mono } from 'next/font/google';
import { AuthProvider } from '@/app/context/AuthContext'
import OneTapComponent from '@/app/components/OneTap'
import ClientLayout from '@/app/components/ClientLayout'  // Default import

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata = {
  title: 'ResearchIQ',
  description: 'Compare multiple AI models for deeper research insights',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider>
          <OneTapComponent />
          <ClientLayout>
            {children}
          </ClientLayout>
        </AuthProvider>
      </body>
    </html>
  )
}