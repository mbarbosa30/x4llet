import { Link } from 'wouter';

export default function Footer() {
  return (
    <footer className="border-t py-4 text-center text-xs text-muted-foreground">
      <div className="flex items-center justify-center gap-4">
        <Link href="/how-it-works">
          <a className="hover-elevate px-2 py-1 rounded" data-testid="link-how-it-works">
            How It Works
          </a>
        </Link>
        <span className="text-border">•</span>
        <Link href="/faqs">
          <a className="hover-elevate px-2 py-1 rounded" data-testid="link-faqs">
            FAQs
          </a>
        </Link>
      </div>
    </footer>
  );
}
