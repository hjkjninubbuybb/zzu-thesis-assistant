import { useEffect, useRef, useState } from 'react';
import { CheckCircle, ChevronDown, Search } from 'lucide-react';

// ── Section ──────────────────────────────────────────────────

export function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card rounded-xl p-5">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center">
          <Icon size={16} className="text-stone-600" />
        </div>
        <h2 className="text-sm font-semibold text-stone-800">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ── Field ────────────────────────────────────────────────────

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-6">
      <div className="w-36 shrink-0 pt-2">
        <p className="text-sm font-medium text-stone-700">{label}</p>
        {hint && <p className="text-xs text-stone-400 mt-0.5">{hint}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

// ── SearchableSelect ─────────────────────────────────────────

export function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = '选择模型...',
}: {
  value: string;
  options: { value: string; label: string; desc?: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = options.filter(
    (o) =>
      o.label.toLowerCase().includes(search.toLowerCase()) ||
      o.value.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative max-w-sm" ref={containerRef}>
      <div
        onClick={() => setOpen(!open)}
        className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm flex items-center justify-between cursor-pointer hover:border-stone-400 transition-all shadow-sm"
      >
        <span className="truncate font-medium text-stone-700">
          {options.find((o) => o.value === value)?.label || value || placeholder}
        </span>
        <ChevronDown
          size={14}
          className={`text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-stone-200 rounded-2xl shadow-2xl overflow-hidden animate-apple-pop origin-top">
          <div className="p-2 border-b border-stone-50 bg-stone-50/50">
            <div className="relative">
              <Search
                size={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索模型名称..."
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-stone-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-stone-200"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto custom-scrollbar py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-xs text-stone-400 text-center italic">
                没有匹配的模型
              </div>
            ) : (
              filtered.map((o) => (
                <div
                  key={o.value}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`px-4 py-2.5 text-sm cursor-pointer transition-colors flex items-center justify-between ${
                    value === o.value
                      ? 'bg-stone-800 text-white'
                      : 'hover:bg-stone-50 text-stone-700'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{o.label}</div>
                    {o.desc && (
                      <div
                        className={`text-[10px] truncate ${value === o.value ? 'text-stone-300' : 'text-stone-400'}`}
                      >
                        {o.desc}
                      </div>
                    )}
                  </div>
                  {value === o.value && <CheckCircle size={14} className="text-white ml-2" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ModelSelect ──────────────────────────────────────────────

export function ModelSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string; desc?: string }[];
  onChange: (v: string) => void;
}) {
  return <SearchableSelect value={value} options={options} onChange={onChange} />;
}

// ── NumberInput ──────────────────────────────────────────────

export function NumberInput({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
      className="w-20 border border-stone-300 rounded-xl px-2.5 py-1.5 text-sm text-center outline-none focus:ring-2 focus:ring-stone-400 focus:border-stone-400"
    />
  );
}
