import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Trash2, Bot, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { buildHerdContext, fetchCowContext } from '@/lib/herdContext';
import { useOperation } from '@/hooks/useOperationContext';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

type Msg = { role: 'user' | 'assistant'; content: string; timestamp: Date };

const WELCOME_MSG: Msg = {
  role: 'assistant',
  content: "Hello! I'm your Blair Herd Assistant. I have access to your full herd data — calving records, sire performance, pregnancy check results, and cow rankings. Ask me anything about your operation and I'll analyze the data and give you a straight answer.",
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

const SYSTEM_PROMPT = `You are an expert cattle ranch management AI assistant for Blair Bros Angus operation.
You have been given a live data summary of their herd below. Use this data to answer questions precisely and practically.

Rules:
- Always cite specific numbers from the data when answering
- If asked about a specific cow by tag number and that cow is not in the top/bottom 10 lists, say you can see summary data but offer to give general guidance
- Give practical ranch management recommendations, not just statistics
- If the data shows a concerning trend, flag it proactively
- Keep answers concise but complete — ranchers are busy
- Use plain language, not academic language
- When comparing sires, be direct about which performs better and why it matters economically
- Format your responses with markdown for readability (bold key numbers, use bullet lists)`;

async function streamChat({
  messages,
  system,
  onDelta,
  onDone,
  onError,
}: {
  messages: { role: string; content: string }[];
  system: string;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
}) {
  try {
    const resp = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages, system }),
    });

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({ error: 'Unknown error' }));
      onError(errBody.error || `Error ${resp.status}`);
      return;
    }

    if (!resp.body) { onError('No response body'); return; }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buf.indexOf('\n')) !== -1) {
        let line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (line.startsWith(':') || line.trim() === '') continue;
        if (!line.startsWith('data: ')) continue;
        const json = line.slice(6).trim();
        if (json === '[DONE]') { onDone(); return; }
        try {
          const parsed = JSON.parse(json);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch { /* partial json, skip */ }
      }
    }
    onDone();
  } catch (e) {
    onError(e instanceof Error ? e.message : 'Network error');
  }
}

export default function AIAssistant() {
  const { operation } = useOperation();
  const [messages, setMessages] = useState<Msg[]>([WELCOME_MSG]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [contextStatus, setContextStatus] = useState('');
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

    // Build context
    setContextStatus('Loading herd data...');
    let herdCtx = '';
    try {
      herdCtx = await buildHerdContext();
    } catch {
      herdCtx = '(Failed to load herd data from Supabase)';
    }

    // Check for cow-specific lookup
    const tagMatch = text.match(/\b(\d{2,4})\b/);
    if (tagMatch) {
      setContextStatus('Looking up cow records...');
      try {
        const cowCtx = await fetchCowContext(tagMatch[1]);
        if (cowCtx) herdCtx += '\n' + cowCtx;
      } catch { /* ignore */ }
    }
    setContextStatus('');

    const systemWithData = `${SYSTEM_PROMPT}\n\nLIVE HERD DATA:\n${herdCtx}`;

    // Build message history (last 6 pairs = 12 messages)
    const allMsgs = [...messages, userMsg];
    const historyMsgs = allMsgs.slice(-12).map(m => ({ role: m.role, content: m.content }));

    let assistantSoFar = '';
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last === prev[prev.length - 1] && assistantSoFar.length > chunk.length) {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
        }
        if (last?.role === 'user') {
          return [...prev, { role: 'assistant' as const, content: assistantSoFar, timestamp: new Date() }];
        }
        return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
      });
      scrollToBottom();
    };

    await streamChat({
      messages: historyMsgs,
      system: systemWithData,
      onDelta: upsert,
      onDone: () => setLoading(false),
      onError: (err) => {
        setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${err}`, timestamp: new Date() }]);
        setLoading(false);
      },
    });
  };

  const clearConversation = () => {
    setMessages([WELCOME_MSG]);
    setInput('');
  };

  const fmt = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

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
                <p className="text-[10px] text-muted-foreground mt-1">Powered by AI · Reading live Supabase data</p>
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
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center mr-2 shrink-0 mt-1">
                    <span className="text-sm">🐂</span>
                  </div>
                )}
                <div className={`max-w-[80%] rounded-lg px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-primary/20 border border-primary text-foreground'
                    : 'bg-card border border-border text-foreground'
                }`}>
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm prose-invert max-w-none text-[13px] [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0.5 [&_strong]:text-primary">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-[13px]">{msg.content}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1.5">{fmt(msg.timestamp)}</p>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center mr-2 shrink-0 mt-1">
                  <span className="text-sm">🐂</span>
                </div>
                <div className="bg-card border border-border rounded-lg px-4 py-3">
                  {contextStatus ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />{contextStatus}
                    </p>
                  ) : (
                    <div className="flex gap-1 items-center h-5">
                      <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  )}
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
