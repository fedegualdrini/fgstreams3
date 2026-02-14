import Link from 'next/link';

interface SiteHeaderProps {
  activeSection?: 'matches' | 'channels';
}

export default function SiteHeader({ activeSection }: SiteHeaderProps) {
  return (
    <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sports Streaming Mirror</h1>
          <p className="text-sm text-gray-400 mt-1">Clean, reliable sports streaming</p>
        </div>
        <nav className="flex items-center gap-2">
          <Link
            href="/"
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSection === 'matches'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:text-white hover:bg-gray-800'
            }`}
          >
            Matches
          </Link>
          <Link
            href="/channels"
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSection === 'channels'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:text-white hover:bg-gray-800'
            }`}
          >
            📺 Channels
          </Link>
        </nav>
      </div>
    </header>
  );
}
