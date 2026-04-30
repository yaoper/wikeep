interface SearchBoxProps {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}

export function SearchBox({ value, placeholder, onChange }: SearchBoxProps) {
  const resolvedPlaceholder = placeholder ?? '支持搜索仓库名称或者对话内容';

  return (
    <div className="search-bar">
      <div className="search-input-wrapper">
        <span className="search-input-icon" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={resolvedPlaceholder}
          aria-label={resolvedPlaceholder}
          className="search-input"
          type="search"
        />
        {value ? (
          <button type="button" className="search-clear" aria-label="清空搜索" onClick={() => onChange('')}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M2 2l6 6M8 2L2 8" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}
