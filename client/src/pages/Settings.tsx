import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronRight, Download, Upload, Globe, DollarSign } from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function Settings() {
  const handleExportBackup = () => {
    console.log('Export backup');
  };

  const handleRestoreBackup = () => {
    console.log('Restore from backup');
  };

  const handleNetworkChange = () => {
    console.log('Change network');
  };

  const handleLanguageChange = () => {
    console.log('Change language');
  };

  const handleCurrencyChange = () => {
    console.log('Change currency');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 border-b flex items-center px-4">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => console.log('Navigate back')}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold ml-2">Settings</h1>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-8">
        <div className="space-y-2">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-2">
            Security
          </h2>
          <Card className="divide-y">
            <button
              onClick={handleExportBackup}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-export-backup"
            >
              <div className="flex items-center gap-3">
                <Download className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">Export Backup</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
            <button
              onClick={handleRestoreBackup}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-restore-backup"
            >
              <div className="flex items-center gap-3">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">Restore from Code</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </Card>
        </div>

        <div className="space-y-2">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-2">
            Network
          </h2>
          <Card>
            <button
              onClick={handleNetworkChange}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-network"
            >
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-muted-foreground" />
                <div className="text-left">
                  <div className="text-sm font-medium">Network</div>
                  <div className="text-xs text-muted-foreground">Base</div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </Card>
        </div>

        <div className="space-y-2">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-2">
            Preferences
          </h2>
          <Card className="divide-y">
            <button
              onClick={handleLanguageChange}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-language"
            >
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-muted-foreground" />
                <div className="text-left">
                  <div className="text-sm font-medium">Language</div>
                  <div className="text-xs text-muted-foreground">English</div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
            <button
              onClick={handleCurrencyChange}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-currency"
            >
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-muted-foreground" />
                <div className="text-left">
                  <div className="text-sm font-medium">Display Currency</div>
                  <div className="text-xs text-muted-foreground">USD</div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </Card>
        </div>

        <div className="pt-4">
          <div className="text-center text-xs text-muted-foreground">
            Version 1.0.0
          </div>
        </div>
      </main>
    </div>
  );
}
