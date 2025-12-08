import { Link } from 'wouter';

export default function Footer() {
  return (
    <footer className="border-t pt-1 pb-4 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
      <div className="flex items-center justify-center gap-4">
        <Link href="/context" className="hover-elevate px-2 py-1" data-testid="link-context">
          Context
        </Link>
        <span className="text-border">•</span>
        <Link href="/how-it-works" className="hover-elevate px-2 py-1" data-testid="link-how-it-works">
          How It Works
        </Link>
        <span className="text-border">•</span>
        <Link href="/faqs" className="hover-elevate px-2 py-1" data-testid="link-faqs">
          FAQs
        </Link>
      </div>
    </footer>
  );
}
