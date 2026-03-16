import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Msg = { role: 'user' | 'assistant'; content: string; timestamp: Date };

interface ChatMessageProps {
  msg: Msg;
  onSendFollowUp: (question: string) => void;
  loading: boolean;
}

const fmt = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * Detects numbered follow-up questions at the end of content.
 * Returns the set of question texts (without the number prefix).
 */
function getFollowUpQuestions(content: string): Set<string> {
  const lines = content.trim().split('\n');
  const questions: string[] = [];

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    const match = line.match(/^\d+[\.\)]\s*\**(.+?)\**\s*$/);
    if (match) {
      questions.unshift(match[1].trim());
    } else if (questions.length > 0) {
      break;
    }
  }

  return questions.length >= 2 ? new Set(questions) : new Set();
}

export function ChatMessage({ msg, onSendFollowUp, loading }: ChatMessageProps) {
  const followUps = msg.role === 'assistant' ? getFollowUpQuestions(msg.content) : new Set<string>();

  return (
    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      {msg.role === 'assistant' && (
        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center mr-2 shrink-0 mt-1">
          <span className="text-sm">🐂</span>
        </div>
      )}
      <div className="max-w-[80%]">
        <div
          className={`rounded-lg px-4 py-3 ${
            msg.role === 'user'
              ? 'bg-primary/20 border border-primary text-foreground'
              : 'bg-card border border-border text-foreground'
          }`}
        >
          {msg.role === 'assistant' ? (
            <div className="prose-chat text-[13px]">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-2 rounded border border-border">
                      <table className="w-full text-xs border-collapse">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => (
                    <thead className="bg-secondary text-foreground">{children}</thead>
                  ),
                  th: ({ children }) => (
                    <th className="px-3 py-1.5 text-left font-semibold border-b border-border whitespace-nowrap">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="px-3 py-1.5 border-b border-border/50 whitespace-nowrap">
                      {children}
                    </td>
                  ),
                  tr: ({ children, ...props }) => (
                    <tr className="even:bg-secondary/30" {...props}>{children}</tr>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc pl-5 my-1.5 space-y-0.5">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal pl-5 my-1.5 space-y-0.5">{children}</ol>
                  ),
                  li: ({ children }) => {
                    // Check if this list item's text matches a follow-up question
                    const text = extractText(children);
                    const cleanText = text.replace(/^\**|\**$/g, '').trim();
                    const isFollowUp = followUps.has(cleanText);

                    if (isFollowUp) {
                      return (
                        <li
                          className="text-foreground cursor-pointer hover:text-primary hover:underline decoration-primary/50 underline-offset-2 transition-colors"
                          onClick={() => !loading && onSendFollowUp(cleanText)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && !loading && onSendFollowUp(cleanText)}
                        >
                          {children}
                        </li>
                      );
                    }
                    return <li className="text-foreground">{children}</li>;
                  },
                  p: ({ children }) => <p className="my-1">{children}</p>,
                  strong: ({ children }) => (
                    <strong className="font-semibold text-primary">{children}</strong>
                  ),
                  h3: ({ children }) => (
                    <h3 className="font-semibold text-foreground mt-2 mb-1">{children}</h3>
                  ),
                  h4: ({ children }) => (
                    <h4 className="font-semibold text-foreground mt-2 mb-1 text-[13px]">{children}</h4>
                  ),
                }}
              >
                {msg.content}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-[13px]">{msg.content}</p>
          )}
          <p className="text-[10px] text-muted-foreground mt-1.5">{fmt(msg.timestamp)}</p>
        </div>
      </div>
    </div>
  );
}

/** Recursively extract plain text from React children */
function extractText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (!children) return '';
  if (Array.isArray(children)) return children.map(extractText).join('');
  if (typeof children === 'object' && 'props' in children) {
    return extractText((children as React.ReactElement).props.children);
  }
  return '';
}
