import Sidebar from '@/components/Sidebar';
import PeriodicalExplorer from '@/components/PeriodicalExplorer';

export default function Home() {
  return (
    <div className="flex h-screen w-full bg-background overflow-hidden text-foreground">
      <Sidebar />
      <PeriodicalExplorer />
    </div>
  );
}
