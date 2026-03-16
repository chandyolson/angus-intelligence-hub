import { cn } from '@/lib/utils';

interface FollowUpChipsProps {
  content: string;
  onSend: (question: string) => void;
  disabled?: boolean;
}

/**
 * Detects numbered follow-up questions at the end of an AI response
 * and renders them as clickable chips.
 */
export function extractFollowUpQuestions(content: string): string[] {
  const lines = content.trim().split('\n');
  const questions: string[] = [];

  // Walk backwards from the end to find numbered questions
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    // Match patterns like "1. Question?" or "1) Question?" or "- **Question?**"
    const numberedMatch = line.match(/^\d+[\.\)]\s*\**(.+?)\**\s*$/);
    if (numberedMatch) {
      questions.unshift(numberedMatch[1].trim());
    } else if (questions.length > 0) {
      // Stop once we hit a non-question line after finding some
      break;
    }
  }

  return questions.length >= 2 ? questions : [];
}

export function FollowUpChips({ content, onSend, disabled }: FollowUpChipsProps) {
  const questions = extractFollowUpQuestions(content);

  if (questions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {questions.map((q, i) => (
        <button
          key={i}
          onClick={() => onSend(q)}
          disabled={disabled}
          className={cn(
            'text-left text-xs px-3 py-1.5 rounded-full',
            'border border-border bg-secondary/50',
            'text-muted-foreground hover:text-foreground',
            'hover:border-primary hover:bg-secondary',
            'transition-all duration-150',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {q}
        </button>
      ))}
    </div>
  );
}
