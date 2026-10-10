import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'EV Grid — Power Your Journey',description:'Discover, reserve, and share EV charging stations across Pakistan.',icons:{icon:'/ev-grid-logo.png'}};
export const viewport: Viewport = {width:"device-width",initialScale:1,viewportFit:"cover"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
