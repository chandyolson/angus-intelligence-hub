import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Trash2, Bot } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { buildContext } from '@/lib/buildContext';
import { ChatMessage } from '@/components/ai-assistant/ChatMessage';

type Msg = { role: 'user' | 'assistant'; content: string; timestamp: Date };

const WELCOME_MSG: Msg = {
  role: 'assistant',
  content: "Hello! I'm your Blair Herd Assistant powered by Claude. I have access to your full herd data — calving records, sire performance, pregnancy check results, and cow rankings. Ask me anything about your operation and I'll analyze the data and give you a straight answer.",
  timestamp: new Date(),
};

const SUGGESTED_QUESTIONS = [
  {
    category: 'Herd Overview',
    questions: [
      'What is the current open rate and how has it trended?',
      'How many active cows are in the herd?',
      'What is the average calving interval and why does it matter?',
    ],
  },
  {
    category: 'Sire Performance',
    questions: [
      'Which sire has the best AI conception rate?',
      'Which sire is used most and how does it perform?',
      'Compare gestation length across all sires',
    ],
  },
  {
    category: 'Culling & Rankings',
    questions: [
      'Which cows should I consider culling and why?',
      'Who are the top 5 performing cows?',
      'Show me cows that have been open multiple times',
    ],
  },
  {
    category: 'Calf Data',
    questions: [
      'What is the average birth weight across the herd?',
      'Which sire produces the heaviest calves?',
      'What is the overall calf survival rate?',
    ],
  },
];

export default function AIAssistant() {
  const [messages, setMessages] = useState<Msg[]>([WELCOME_MSG]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<'searching' | 'thinking' | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50);
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Msg = { role: 'user', content: text.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      setLoadingPhase('searching');
      const context = await buildContext(text.trim());
      setLoadingPhase('thinking');
      const { data, error } = await supabase.functions.invoke('chat', {
        body: { question: text.trim(), context },
      });
      if (error) throw error;

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer || 'No response received.',
        timestamp: new Date(),
      }]);
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ ${e instanceof Error ? e.message : 'Network error'}`,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
      setLoadingPhase(null);
    }
  };

  const clearConversation = () => {
    setMessages([WELCOME_MSG]);
    setInput('');
  };

  return (
    <div className="space-y-4 h-[calc(100vh-8rem)]">
      <h1 className="text-[20px] font-semibold text-foreground">AI Assistant</h1>

      <div className="flex gap-4 h-[calc(100%-3rem)]">
        {/* Chat area - 65% */}
        <div className="flex-[65] flex flex-col min-w-0">
          {/* Header card */}
          <Card className="bg-card border-border mb-3 shrink-0">
            <CardContent className="p-4 flex items-start gap-3">
              <Bot className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-semibold text-foreground">Blair Herd Assistant</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ask anything about your herd — cows, sires, trends, culling candidates, or comparisons.
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">Powered by Claude · Reading live herd data</p>
              </div>
              <button
                onClick={clearConversation}
                className="ml-auto text-muted-foreground hover:text-foreground transition-colors p-1"
                title="Clear Conversation"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </CardContent>
          </Card>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
            {messages.map((msg, i) => (
              <ChatMessage
                key={i}
                msg={msg}
                onSendFollowUp={sendMessage}
                loading={loading}
              />
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center mr-2 shrink-0 mt-1">
                  <span className="text-sm">🐂</span>
                </div>
                <div className="bg-card border border-border rounded-lg px-4 py-3">
                  <div className="flex gap-1 items-center h-5">
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="flex gap-2 mt-3 shrink-0">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
              placeholder="Ask about your herd..."
              disabled={loading}
              className="flex-1 bg-card border border-border rounded-md px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              className="bg-primary text-primary-foreground px-4 py-2.5 rounded-md font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
            >
              <Send className="h-4 w-4" />
              Send
            </button>
          </div>
        </div>

        {/* Quick Questions - 35% */}
        <div className="flex-[35] min-w-0 overflow-y-auto hidden md:block">
          <h3 className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium mb-4">Suggested Questions</h3>
          <div className="space-y-5">
            {SUGGESTED_QUESTIONS.map(group => (
              <div key={group.category}>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2 font-medium">{group.category}</p>
                <div className="space-y-1.5">
                  {group.questions.map(q => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      disabled={loading}
                      className="w-full text-left bg-card border border-border rounded-md px-3 py-2 text-xs text-muted-foreground hover:border-primary hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
