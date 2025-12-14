import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Bot, Send, Loader2, Zap, User, AlertCircle } from 'lucide-react';
import { getWallet } from '@/lib/wallet';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface XpBalanceResponse {
  walletAddress: string;
  totalXp: number;
  lastClaimTime: string | null;
  claimCount: number;
}

interface ChatResponse {
  message: string;
  xpDeducted: number;
  newBalance: number;
}

export default function AiChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  useEffect(() => {
    async function loadWallet() {
      const wallet = await getWallet();
      if (wallet?.address) {
        setWalletAddress(wallet.address);
      }
    }
    loadWallet();
  }, []);

  const { data: xpData, isLoading: xpLoading } = useQuery<XpBalanceResponse>({
    queryKey: ['/api/xp', walletAddress],
    enabled: !!walletAddress,
  });

  const xpBalance = xpData?.totalXp ? xpData.totalXp / 100 : 0;

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const conversationHistory = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));
      
      const response = await apiRequest('POST', '/api/ai/chat', {
        message,
        walletAddress,
        conversationHistory,
      });
      
      return response.json() as Promise<ChatResponse>;
    },
    onSuccess: (data) => {
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
      queryClient.invalidateQueries({ queryKey: ['/api/xp', walletAddress] });
    },
    onError: (error: any) => {
      if (error.message?.includes('402') || error.message?.includes('Insufficient XP')) {
        toast({
          title: 'Insufficient XP',
          description: 'You need at least 1 XP to send a message. Earn more XP through MaxFlow claims.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to get AI response. Your XP has been refunded.',
          variant: 'destructive',
        });
      }
    },
  });

  const handleSend = () => {
    if (!inputValue.trim() || chatMutation.isPending) return;
    
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    chatMutation.mutate(inputValue.trim());
    setInputValue('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!walletAddress) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Card className="p-6 text-center">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Please unlock your wallet to use AI Chat.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20 pt-16">
      <div className="flex-shrink-0 p-4 border-b border-foreground/10">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-[#0055FF]" />
            <span className="font-mono font-semibold text-sm uppercase tracking-wider">AI CHAT</span>
          </div>
          <Badge variant="outline" className="font-mono text-xs" data-testid="xp-balance-badge">
            <Zap className="h-3 w-3 mr-1" />
            {xpLoading ? '...' : `${xpBalance.toFixed(2)} XP`}
          </Badge>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <Bot className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
              <h3 className="font-mono text-sm font-semibold uppercase tracking-wider mb-2">
                Your Gateway to Knowledge
              </h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Ask anything. Learn something new. Education, skills, health, business, science, or just curiosity - I'm here to help you grow.
              </p>
              <p className="text-xs text-muted-foreground mt-4 font-mono">
                1 XP per question
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              data-testid={`message-${msg.role}-${msg.id}`}
            >
              {msg.role === 'assistant' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-sm bg-[#0055FF] flex items-center justify-center">
                  <Bot className="h-4 w-4 text-white" />
                </div>
              )}
              <Card 
                className={`p-3 max-w-[80%] ${
                  msg.role === 'user' 
                    ? 'bg-[#0055FF] text-white border-[#0055FF]' 
                    : 'bg-card'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </Card>
              {msg.role === 'user' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-sm bg-foreground/10 flex items-center justify-center">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}

          {chatMutation.isPending && (
            <div className="flex gap-3 justify-start">
              <div className="flex-shrink-0 w-8 h-8 rounded-sm bg-[#0055FF] flex items-center justify-center">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <Card className="p-3 bg-card">
                <Loader2 className="h-4 w-4 animate-spin" />
              </Card>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="flex-shrink-0 p-4 border-t border-foreground/10 bg-background">
        <div className="max-w-md mx-auto flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask anything..."
            disabled={chatMutation.isPending || xpBalance < 1}
            className="flex-1 font-mono text-sm"
            data-testid="input-chat-message"
          />
          <Button
            onClick={handleSend}
            disabled={!inputValue.trim() || chatMutation.isPending || xpBalance < 1}
            size="icon"
            className="bg-[#0055FF] hover:bg-[#0044CC]"
            data-testid="button-send-message"
          >
            {chatMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        {xpBalance < 1 && (
          <p className="text-xs text-destructive text-center mt-2 font-mono">
            Insufficient XP. Claim more through MaxFlow.
          </p>
        )}
      </div>
    </div>
  );
}
