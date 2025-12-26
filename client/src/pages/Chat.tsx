import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { 
  Bot, Send, Loader2, Zap, User, AlertCircle, Trash2, 
  MapPin, Heart, MessageCircle, Navigation, RefreshCw, ChevronDown, ChevronUp, Globe
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useXp } from '@/hooks/useXp';
import { useWallet } from '@/hooks/useWallet';
import { formatDistanceToNow } from 'date-fns';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ChatResponse {
  message: string;
  xpDeducted: number;
  newBalance: number;
}

interface ConversationResponse {
  messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>;
  updatedAt?: string;
}

interface GeoPost {
  id: string;
  content: string;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  hasLiked: boolean;
  authorShort: string;
}

interface GeoComment {
  id: string;
  content: string;
  createdAt: string;
  authorShort: string;
}

interface GeoCosts {
  post: number;
  comment: number;
  like: number;
}

interface Location {
  latitude: number;
  longitude: number;
}

export default function Chat() {
  const { address: walletAddress } = useWallet({ redirectOnMissing: false });
  const [activeTab, setActiveTab] = useState('geochat');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: xpData, isLoading: xpLoading } = useXp(walletAddress, { staleTime: 0 });
  const xpBalance = xpData?.totalXp ?? 0;

  if (!walletAddress) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Card className="p-6 text-center">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Please unlock your wallet to use Chat.</p>
        </Card>
      </div>
    );
  }

  return (
    <div 
      className="bg-background flex flex-col"
      style={{ 
        height: 'calc(100dvh - 8rem)',
        marginTop: 'calc(4rem + env(safe-area-inset-top))',
      }}
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        <div className="flex-shrink-0 px-4 pt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="geochat" className="flex items-center gap-2" data-testid="tab-geochat">
              <MapPin className="h-4 w-4" />
              GeoChat
            </TabsTrigger>
            <TabsTrigger value="ai" className="flex items-center gap-2" data-testid="tab-ai">
              <Bot className="h-4 w-4" />
              AI Chat
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="geochat" className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden">
          <GeoChatTab 
            walletAddress={walletAddress} 
            xpBalance={xpBalance}
            xpLoading={xpLoading}
          />
        </TabsContent>

        <TabsContent value="ai" className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden">
          <AiChatTab 
            walletAddress={walletAddress}
            xpBalance={xpBalance}
            xpLoading={xpLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface TabProps {
  walletAddress: string;
  xpBalance: number;
  xpLoading: boolean;
}

function GeoChatTab({ walletAddress, xpBalance, xpLoading }: TabProps) {
  const [location, setLocation] = useState<Location | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [radius, setRadius] = useState(5);
  const [newPostContent, setNewPostContent] = useState('');
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: costs } = useQuery<GeoCosts>({
    queryKey: ['/api/geo/costs'],
  });

  const postCost = costs?.post ?? 2;
  const commentCost = costs?.comment ?? 1;

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }

    setLocationLoading(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationLoading(false);
      },
      (error) => {
        setLocationLoading(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError('Location access denied. Please enable location in your browser settings.');
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError('Location information is unavailable.');
            break;
          case error.TIMEOUT:
            setLocationError('Location request timed out.');
            break;
          default:
            setLocationError('An unknown error occurred.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  const { data: postsData, isLoading: postsLoading, refetch: refetchPosts } = useQuery<{ posts: GeoPost[]; total: number; radius: number; geohash: string }>({
    queryKey: ['/api/geo/posts', location?.latitude, location?.longitude, radius, walletAddress],
    queryFn: async () => {
      if (!location) return { posts: [], total: 0, radius: 0, geohash: '' };
      const params = new URLSearchParams({
        lat: location.latitude.toString(),
        lon: location.longitude.toString(),
        radius: radius.toString(),
        wallet: walletAddress,
      });
      const response = await fetch(`/api/geo/posts?${params}`);
      if (!response.ok) throw new Error('Failed to load posts');
      return response.json();
    },
    enabled: !!location,
    staleTime: 30000,
  });

  const createPostMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest('POST', '/api/geo/posts', {
        wallet: walletAddress,
        content,
        latitude: location!.latitude,
        longitude: location!.longitude,
      });
      return response.json();
    },
    onSuccess: () => {
      setNewPostContent('');
      setShowComposer(false);
      queryClient.invalidateQueries({ queryKey: ['/api/geo/posts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/xp', walletAddress] });
      toast({ title: 'Post created!', description: `Spent ${postCost} XP` });
    },
    onError: (error: any) => {
      const message = error?.message || 'Failed to create post';
      if (message.includes('Insufficient XP')) {
        toast({ title: 'Insufficient XP', description: `You need ${postCost} XP to post`, variant: 'destructive' });
      } else if (message.includes('Rate limit')) {
        toast({ title: 'Rate limited', description: 'You can only post 5 times per hour', variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: message, variant: 'destructive' });
      }
    },
  });

  const likeMutation = useMutation({
    mutationFn: async (postId: string) => {
      const response = await apiRequest('POST', `/api/geo/posts/${postId}/like`, {
        wallet: walletAddress,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/geo/posts'] });
    },
  });

  const handleCreatePost = () => {
    if (!newPostContent.trim() || !location) return;
    createPostMutation.mutate(newPostContent.trim());
  };

  const radiusOptions = [1, 5, 10, 25, 50, 100];

  // Loading state - brutalist style
  if (locationLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="border-2 border-foreground p-8 bg-background">
            <Navigation className="h-12 w-12 mx-auto mb-4 animate-pulse" />
            <p className="font-mono text-xs uppercase tracking-widest text-center">
              // ACQUIRING_LOCATION
            </p>
            <div className="mt-4 h-1 bg-foreground/20 overflow-hidden">
              <div className="h-full bg-[#0055FF] animate-pulse w-1/2" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Permission request - brutalist banner style
  if (locationError || !location) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="border-2 border-foreground p-6 bg-background max-w-sm w-full">
            <div className="border-b-2 border-foreground pb-3 mb-4">
              <p className="font-mono text-xs uppercase tracking-widest text-[#0055FF]">
                // LOCATION_REQUIRED
              </p>
            </div>
            <MapPin className="h-16 w-16 mx-auto mb-4" strokeWidth={1.5} />
            <p className="text-center mb-4 text-sm">
              {locationError || 'GeoChat needs your location to show posts from people nearby.'}
            </p>
            <Button 
              onClick={requestLocation} 
              className="w-full uppercase tracking-wide"
              data-testid="button-enable-location"
            >
              <Navigation className="h-4 w-4 mr-2" />
              ENABLE LOCATION
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-3 font-mono">
              Your exact location is never shared
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header Bar - Clean Style */}
      <div className="flex-shrink-0 bg-background">
        {/* Top row: Location + XP info */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-[#0055FF]" />
            <span className="font-mono text-xs uppercase tracking-widest">NEARBY</span>
          </div>
          <span className="text-xs text-muted-foreground" data-testid="xp-cost-label">
            {postCost} XP / post · Earn {commentCost} XP per reply
          </span>
        </div>
        
        {/* Radius Pills */}
        <div className="flex items-center justify-between px-4 pb-3">
          <div className="flex items-center gap-1">
            {radiusOptions.map((r) => (
              <button
                key={r}
                onClick={() => setRadius(r)}
                className={`px-3 py-1.5 font-mono text-xs uppercase border transition-colors ${
                  radius === r 
                    ? 'bg-foreground text-background border-foreground' 
                    : 'bg-background text-foreground border-foreground/20 hover:border-foreground'
                }`}
                data-testid={`radius-${r}km`}
              >
                {r}KM
              </button>
            ))}
          </div>
          <button
            onClick={() => refetchPosts()}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-refresh-posts"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        
        <div className="border-t border-foreground/10" />

        {/* Composer Toggle */}
        <button
          onClick={() => setShowComposer(!showComposer)}
          className="w-full flex items-center justify-between px-4 py-2 border-t border-foreground/20 hover:bg-foreground/5 transition-colors"
          data-testid="button-toggle-composer"
        >
          <span className="font-mono text-xs uppercase tracking-wide text-[#0055FF]">
            + NEW POST ({postCost} XP)
          </span>
          {showComposer ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {/* Composer Panel */}
        {showComposer && (
          <div className="px-4 py-3 border-t border-foreground/20 bg-secondary/30">
            <Textarea
              placeholder="What's happening nearby?"
              value={newPostContent}
              onChange={(e) => setNewPostContent(e.target.value.slice(0, 500))}
              className="resize-none text-sm border-foreground/30 focus:border-[#0055FF] bg-background"
              rows={3}
              disabled={xpBalance < postCost}
              data-testid="input-new-post"
            />
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-muted-foreground">
                  {newPostContent.length}/500
                </span>
                {xpBalance < postCost && (
                  <span className="font-mono text-xs text-destructive">
                    NEED {postCost} XP
                  </span>
                )}
              </div>
              <Button
                size="sm"
                onClick={handleCreatePost}
                disabled={!newPostContent.trim() || createPostMutation.isPending || xpBalance < postCost}
                className="uppercase tracking-wide"
                data-testid="button-create-post"
              >
                {createPostMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-1" />
                    POST
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto">
        {postsLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border border-foreground/20 p-4 animate-pulse">
                <div className="h-3 bg-foreground/10 w-24 mb-3" />
                <div className="space-y-2">
                  <div className="h-4 bg-foreground/10 w-full" />
                  <div className="h-4 bg-foreground/10 w-3/4" />
                </div>
                <div className="flex gap-4 mt-4">
                  <div className="h-3 bg-foreground/10 w-12" />
                  <div className="h-3 bg-foreground/10 w-12" />
                </div>
              </div>
            ))}
          </div>
        ) : postsData?.posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6">
            <div className="border-2 border-foreground/30 p-8 text-center max-w-sm">
              <div className="border-b border-foreground/20 pb-3 mb-4">
                <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  // NO_POSTS_NEARBY
                </p>
              </div>
              <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground mb-4">
                No one has posted within {radius}km yet.
              </p>
              <Button
                onClick={() => setShowComposer(true)}
                variant="outline"
                className="uppercase tracking-wide"
              >
                BE THE FIRST
              </Button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-foreground/10">
            {postsData?.posts.map((post) => (
              <GeoPostCard
                key={post.id}
                post={post}
                walletAddress={walletAddress}
                xpBalance={xpBalance}
                commentCost={commentCost}
                isExpanded={expandedPostId === post.id}
                onToggleExpand={() => setExpandedPostId(expandedPostId === post.id ? null : post.id)}
                onLike={() => likeMutation.mutate(post.id)}
                likePending={likeMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface GeoPostCardProps {
  post: GeoPost;
  walletAddress: string;
  xpBalance: number;
  commentCost: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onLike: () => void;
  likePending: boolean;
}

function GeoPostCard({ post, walletAddress, xpBalance, commentCost, isExpanded, onToggleExpand, onLike, likePending }: GeoPostCardProps) {
  const [newComment, setNewComment] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: commentsData, isLoading: commentsLoading } = useQuery<{ comments: GeoComment[] }>({
    queryKey: ['/api/geo/posts', post.id, 'comments'],
    queryFn: async () => {
      const response = await fetch(`/api/geo/posts/${post.id}/comments`);
      if (!response.ok) throw new Error('Failed to load comments');
      return response.json();
    },
    enabled: isExpanded,
  });

  const createCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest('POST', `/api/geo/posts/${post.id}/comments`, {
        wallet: walletAddress,
        content,
      });
      return response.json();
    },
    onSuccess: () => {
      setNewComment('');
      queryClient.invalidateQueries({ queryKey: ['/api/geo/posts', post.id, 'comments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/geo/posts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/xp', walletAddress] });
      toast({ title: 'Comment added!', description: `Spent ${commentCost} XP` });
    },
    onError: (error: any) => {
      const message = error?.message || 'Failed to add comment';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    },
  });

  const handleSubmitComment = () => {
    if (!newComment.trim()) return;
    createCommentMutation.mutate(newComment.trim());
  };

  return (
    <div 
      className="py-4 px-4 border-l-2 border-l-[#0055FF] hover:bg-foreground/[0.02] transition-colors"
      data-testid={`post-card-${post.id}`}
    >
      {/* Author & Time - Simple inline */}
      <div className="flex items-center gap-2 mb-2 text-muted-foreground">
        <span className="font-mono text-xs">
          {post.authorShort}
        </span>
        <span className="text-xs">
          {formatDistanceToNow(new Date(post.createdAt), { addSuffix: false })} ago
        </span>
      </div>

      {/* Content */}
      <p className="text-sm whitespace-pre-wrap mb-3 leading-relaxed font-medium">{post.content}</p>

      {/* Actions - Simple icons with counts */}
      <div className="flex items-center gap-4 text-muted-foreground">
        <button
          onClick={onLike}
          disabled={likePending}
          className={`flex items-center gap-1 text-sm transition-colors ${
            post.hasLiked ? 'text-[#0055FF]' : 'hover:text-foreground'
          }`}
          data-testid={`button-like-${post.id}`}
        >
          <Heart className={`h-4 w-4 ${post.hasLiked ? 'fill-[#0055FF]' : ''}`} />
          <span>{post.likeCount}</span>
        </button>
        <button
          onClick={onToggleExpand}
          className={`flex items-center gap-1 text-sm transition-colors ${
            isExpanded ? 'text-[#0055FF]' : 'hover:text-foreground'
          }`}
          data-testid={`button-comments-${post.id}`}
        >
          <MessageCircle className={`h-4 w-4 ${isExpanded ? 'fill-[#0055FF]/20' : ''}`} />
          <span>{post.commentCount}</span>
        </button>
      </div>

      {/* Comments Section */}
      {isExpanded && (
        <div className="mt-4 pt-3 border-t border-foreground/10">
          {/* Comment Input */}
          <div className="mb-3">
            <div className="flex gap-2">
              <Input
                placeholder="Add a reply..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value.slice(0, 280))}
                className="flex-1 text-sm border-foreground/20 focus:border-[#0055FF]"
                disabled={xpBalance < commentCost}
                data-testid={`input-comment-${post.id}`}
              />
              <Button
                size="icon"
                onClick={handleSubmitComment}
                disabled={!newComment.trim() || createCommentMutation.isPending || xpBalance < commentCost}
                data-testid={`button-submit-comment-${post.id}`}
              >
                {createCommentMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="font-mono text-xs text-muted-foreground">
                {newComment.length}/280
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {xpBalance < commentCost ? (
                  <span className="text-destructive">NEED {commentCost} XP</span>
                ) : (
                  `COSTS ${commentCost} XP`
                )}
              </span>
            </div>
          </div>

          {/* Comments List */}
          {commentsLoading ? (
            <div className="py-4 flex justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : commentsData?.comments.length === 0 ? (
            <p className="font-mono text-xs text-muted-foreground text-center py-3">
              // NO_REPLIES_YET
            </p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {commentsData?.comments.map((comment) => (
                <div 
                  key={comment.id} 
                  className="pl-3 border-l-2 border-foreground/10"
                  data-testid={`comment-${comment.id}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-muted-foreground">{comment.authorShort}</span>
                    <span className="font-mono text-xs text-muted-foreground/50">
                      {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm">{comment.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AiChatTab({ walletAddress, xpBalance, xpLoading }: TabProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [conversationLoaded, setConversationLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: conversationData, isLoading: conversationLoading } = useQuery<ConversationResponse>({
    queryKey: ['/api/ai/conversation', walletAddress],
    queryFn: async () => {
      const response = await fetch(`/api/ai/conversation/${walletAddress}`);
      if (!response.ok) throw new Error('Failed to load conversation');
      return response.json();
    },
    enabled: !!walletAddress && !conversationLoaded,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (conversationData && !conversationLoaded) {
      const loadedMessages: Message[] = conversationData.messages.map((msg, idx) => ({
        id: `loaded-${idx}-${Date.now()}`,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
      }));
      setMessages(loadedMessages);
      setConversationLoaded(true);
    }
  }, [conversationData, conversationLoaded]);

  const saveConversationMutation = useMutation({
    mutationFn: async (msgs: Message[]) => {
      const messagesToSave = msgs.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      }));
      
      await apiRequest('POST', '/api/ai/conversation', {
        walletAddress,
        messages: messagesToSave,
      });
    },
  });

  const clearConversationMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', `/api/ai/conversation/${walletAddress}`);
    },
    onSuccess: () => {
      setMessages([]);
      queryClient.invalidateQueries({ queryKey: ['/api/ai/conversation', walletAddress] });
      toast({
        title: 'Conversation cleared',
        description: 'Your chat history has been deleted.',
      });
    },
  });

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
        timestamp: new Date().toISOString(),
      };
      
      setMessages(prev => {
        const updatedMessages = [...prev, assistantMessage];
        saveConversationMutation.mutate(updatedMessages);
        return updatedMessages;
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/xp', walletAddress] });
    },
    onError: (error: any) => {
      if (error.message?.includes('402') || error.message?.includes('Insufficient XP')) {
        toast({
          title: 'Insufficient XP',
          description: 'You need at least 1 XP to send a message.',
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
      timestamp: new Date().toISOString(),
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

  const handleClearConversation = () => {
    if (messages.length > 0) {
      clearConversationMutation.mutate();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (conversationLoading && !conversationLoaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-foreground/10">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-[#0055FF]" />
          <span className="font-mono font-semibold text-sm uppercase tracking-wider">AI ASSISTANT</span>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClearConversation}
              disabled={clearConversationMutation.isPending}
              data-testid="button-clear-ai-conversation"
            >
              {clearConversationMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          )}
          <Badge variant="outline" className="font-mono text-xs" data-testid="ai-xp-badge">
            <Zap className="h-3 w-3 mr-1" />
            {xpLoading ? '...' : `${xpBalance.toFixed(2)} XP`}
          </Badge>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2">
        <div className="max-w-md mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-4">
              <Bot className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
              <h3 className="font-mono text-sm font-semibold uppercase tracking-wider mb-1">
                Your Gateway to Knowledge
              </h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Ask anything. Learn something new.
              </p>
              <p className="text-xs text-muted-foreground mt-2 font-mono">
                1 XP per question
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              data-testid={`ai-message-${msg.role}-${msg.id}`}
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

      <div className="flex-shrink-0 bg-background border-t border-foreground/10 p-4">
        <div className="max-w-md mx-auto flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask anything..."
            disabled={chatMutation.isPending || xpBalance < 1}
            className="flex-1 font-mono text-sm"
            data-testid="input-ai-message"
          />
          <Button
            onClick={handleSend}
            disabled={!inputValue.trim() || chatMutation.isPending || xpBalance < 1}
            size="icon"
            data-testid="button-send-ai-message"
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
            Insufficient XP.
          </p>
        )}
      </div>
    </div>
  );
}
