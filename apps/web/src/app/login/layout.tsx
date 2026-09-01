export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="bg-bg text-panel-text min-h-screen w-full relative transition-colors duration-250 flex flex-col md:flex-row">
      {children}
    </div>
  );
}
