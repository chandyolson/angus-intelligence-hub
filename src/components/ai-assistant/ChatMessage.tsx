import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FollowUpChips } from './FollowUpChips';

type Msg = { role: 'user' | 'assistant'; content: string; timestamp: Date };

interface ChatMessageProps {
  msg: Msg;
  onSendFollowUp: (question: string) => void;
  loading: boolean;
}

const fmt = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function ChatMessage({ msg, onSendFollowUp, loading }: ChatMessageProps) {
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
                    <tr className="even:bg-secondary/30" {...props}>
                      {children}
                    </tr>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc pl-5 my-1.5 space-y-0.5">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal pl-5 my-1.5 space-y-0.5">{children}</ol>
                  ),
                  li: ({ children }) => <li className="text-foreground">{children}</li>,
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

        {msg.role === 'assistant' && (
          <FollowUpChips content={msg.content} onSend={onSendFollowUp} disabled={loading} />
        )}
      </div>
    </div>
  );
}
