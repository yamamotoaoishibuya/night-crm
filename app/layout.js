import "./globals.css";

export const metadata = {
  title: "Night CRM",
  description: "キャバクラ専用顧客管理アプリ",
  manifest: "/manifest.webmanifest"
};

export default function RootLayout({ children }) {
  return <html lang="ja"><body>{children}</body></html>;
}
