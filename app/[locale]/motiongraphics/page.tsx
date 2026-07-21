import EarlySavings from "./EarlySavings";

export default function MotionGraphicsPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F5F7]">
      <div className="relative w-full max-w-[430px] aspect-[9/16] bg-white shadow-2xl overflow-hidden">
        <EarlySavings />
      </div>
    </main>
  );
}