import React from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

interface ChartData {
  type: 'bar' | 'line';
  title?: string;
  xKey: string;
  yKey: string;
  data: Record<string, unknown>[];
}

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--accent))',
  'hsl(142 71% 45%)',
  'hsl(48 96% 53%)',
  'hsl(280 67% 60%)',
  'hsl(200 80% 55%)',
  'hsl(350 80% 55%)',
  'hsl(160 60% 45%)',
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-foreground mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-xs text-foreground">
          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: entry.color }} />
          {entry.value}
        </p>
      ))}
    </div>
  );
};

export function InlineChart({ config }: { config: ChartData }) {
  const { type, title, xKey, yKey, data } = config;

  if (!data?.length || !xKey || !yKey) return null;

  return (
    <div className="my-3 rounded-lg border border-border bg-card/50 p-3">
      {title && (
        <h4 className="text-xs font-semibold text-foreground mb-2">{title}</h4>
      )}
      <ResponsiveContainer width="100%" height={200}>
        {type === 'line' ? (
          <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey={yKey}
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ r: 3, fill: 'hsl(var(--primary))' }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} interval={0} angle={data.length > 6 ? -35 : 0} textAnchor={data.length > 6 ? 'end' : 'middle'} height={data.length > 6 ? 50 : 30} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey={yKey} radius={[3, 3, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Parse a chart JSON string. Returns null if invalid.
 */
export function parseChartJson(raw: string): ChartData | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.type === 'bar' || parsed.type === 'line') && parsed.xKey && parsed.yKey && Array.isArray(parsed.data)) {
      return parsed as ChartData;
    }
  } catch { /* ignore */ }
  return null;
}
