interface SearchBoxProps {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}

export function SearchBox({ value, placeholder, onChange }: SearchBoxProps) {
  return (
    <div className="search-bar">
      <div className="search-input-wrapper">
        <span className="search-input-icon" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? '搜索'}
          className="search-input"
          type="search"
        />
        {value ? (
          <button type="button" className="search-clear" onClick={() => onChange('')}>
            ✕
          </button>
        ) : null}
      </div>
    </div>
  );
}
