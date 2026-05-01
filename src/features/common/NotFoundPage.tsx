import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-bg-dark px-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-2xl font-bold text-text-dark">404</h1>
        <p className="text-sm text-text-muted">页面不存在</p>
        <Link
          to="/shows"
          className="rounded-md border border-border-dark px-4 py-2 text-sm text-text-dark transition-colors hover:bg-surface-dark"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
