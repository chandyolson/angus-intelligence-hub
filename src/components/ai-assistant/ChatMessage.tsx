import React, { useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Download, FileText } from 'lucide-react';

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
    if (!line) continue; // skip blank lines
    // Match: "1. Question?" or "1) Question?" with optional bold/italic wrapping
    const match = line.match(/^\d+[\.\)]\s*[\*_]{0,3}(.+?)[\*_]{0,3}\s*$/);
    if (match) {
      questions.unshift(match[1].trim());
    } else if (questions.length > 0) {
      break;
    }
  }

  return questions.length >= 2 ? new Set(questions) : new Set();
}

function extractTableData(tableEl: HTMLTableElement): { headers: string[]; rows: string[][] } {
  const headers: string[] = [];
  const rows: string[][] = [];
  tableEl.querySelectorAll('thead th').forEach(th => headers.push(th.textContent?.trim() ?? ''));
  tableEl.querySelectorAll('tbody tr').forEach(tr => {
    const row: string[] = [];
    tr.querySelectorAll('td').forEach(td => row.push(td.textContent?.trim() ?? ''));
    rows.push(row);
  });
  return { headers, rows };
}

function downloadCSV(tableEl: HTMLTableElement) {
  const { headers, rows } = extractTableData(tableEl);
  const csvContent = [headers, ...rows].map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'table-export.csv';
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadPDF(tableEl: HTMLTableElement) {
  const { headers, rows } = extractTableData(tableEl);
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: headers.length > 5 ? 'landscape' : 'portrait' });
  autoTable(doc, {
    head: [headers],
    body: rows,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [55, 65, 81] },
  });
  doc.save('table-export.pdf');
}

function TableWithExport({ children }: { children: React.ReactNode }) {
  const tableRef = useRef<HTMLTableElement>(null);

  const handleCSV = useCallback(() => {
    if (tableRef.current) downloadCSV(tableRef.current);
  }, []);

  const handlePDF = useCallback(() => {
    if (tableRef.current) downloadPDF(tableRef.current);
  }, []);

  return (
    <div className="group/table relative overflow-x-auto my-2 rounded border border-border">
      <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover/table:opacity-100 transition-opacity z-10">
        <button
          onClick={handleCSV}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border/50 backdrop-blur-sm transition-colors"
          title="Download CSV"
        >
          <Download size={10} /> CSV
        </button>
        <button
          onClick={handlePDF}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border/50 backdrop-blur-sm transition-colors"
          title="Download PDF"
        >
          <FileText size={10} /> PDF
        </button>
      </div>
      <table ref={tableRef} className="w-full text-xs border-collapse">{children}</table>
    </div>
  );
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
                    <TableWithExport>{children}</TableWithExport>
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
                  ol: ({ children }) => {
                    // Check if this ordered list contains follow-up questions
                    const hasFollowUps = followUps.size > 0;
                    return (
                      <ol className={`list-decimal pl-5 my-1.5 ${hasFollowUps ? 'space-y-1.5' : 'space-y-0.5'}`}>
                        {children}
                      </ol>
                    );
                  },
                  li: ({ children }) => {
                    const text = extractText(children);
                    const cleanText = text.replace(/^[\*_]+|[\*_]+$/g, '').trim();
                    const isFollowUp = followUps.has(cleanText);

                    if (isFollowUp) {
                      return (
                        <li
                          className="list-none -ml-5 text-foreground cursor-pointer border border-border rounded-lg px-3 py-2 hover:border-primary hover:text-primary hover:bg-primary/10 active:bg-primary/20 active:ring-2 active:ring-primary/30 active:scale-[0.98] transition-all duration-150 select-none"
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
