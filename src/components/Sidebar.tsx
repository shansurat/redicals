import { Home, Library, Code } from 'lucide-react';

export default function Sidebar() {
  return (
    <div className="w-64 h-full bg-card border-r border-border p-4 flex flex-col gap-6 hidden md:flex">
      <div className="flex items-center gap-2 font-semibold text-lg px-2">
        <div className="w-6 h-6 bg-foreground rounded flex items-center justify-center">
          <Library className="w-4 h-4 text-background" />
        </div>
        Redicals
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        <div className="text-xs font-semibold text-muted mb-2 px-2 uppercase tracking-wider">Workspace</div>
        <button className="flex items-center gap-2 px-2 py-1.5 rounded bg-card-hover font-medium text-sm text-foreground transition-colors w-full text-left">
          <Home className="w-4 h-4 text-muted" />
          Index
        </button>
      </nav>

      <div className="mt-auto flex flex-col gap-4">
        <div className="px-2 pt-4 border-t border-border flex flex-col gap-2">
          <p className="text-xs text-muted leading-tight">
            A project for LIS 198: Data Structures.
          </p>
          <p className="text-xs font-medium text-foreground">
            Developed with ❤️ by <a href="https://github.com/shansurat" target="_blank" rel="noopener noreferrer" className="hover:underline">Shan Surat</a>
          </p>
          <a 
            href="https://github.com/shansurat/redicals" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 mt-1 text-xs text-muted hover:text-foreground transition-colors w-fit"
          >
            <Code className="w-3.5 h-3.5" />
            Source
          </a>
        </div>
      </div>
    </div>
  );
}
