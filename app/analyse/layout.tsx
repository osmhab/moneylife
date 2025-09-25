export default function AnalyseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 md:px-6 lg:px-8">
      {children}
    </div>
  );
}
