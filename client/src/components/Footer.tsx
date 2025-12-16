import { Link } from 'wouter';
import { SiTelegram } from 'react-icons/si';

export default function Footer() {
  return (
    <footer className="border-t py-4 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
      <div className="flex items-center justify-center gap-4">
        <Link href="/how-it-works" className="hover-elevate px-2 py-1" data-testid="link-how-it-works">
          How It Works
        </Link>
        <span className="text-border">•</span>
        <Link href="/faqs" className="hover-elevate px-2 py-1" data-testid="link-faqs">
          FAQs
        </Link>
        <span className="text-border">•</span>
        <a 
          href="https://t.me/+zWefAe1jX9FhODU0" 
          target="_blank" 
          rel="noopener noreferrer"
          className="hover-elevate px-2 py-1 flex items-center gap-1"
          data-testid="link-telegram"
        >
          <SiTelegram className="h-3 w-3" />
          Community
        </a>
      </div>
    </footer>
  );
}
