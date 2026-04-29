interface SearchBoxProps {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}

export function SearchBox({ value, placeholder, onChange }: SearchBoxProps) {
  return (
    <div className="search-bar">
      <div className="search-input-wrapper">
        <span className="search-input-icon">⌕</span>
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
