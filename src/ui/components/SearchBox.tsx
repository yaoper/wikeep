import type { ChangeEvent } from 'react';

interface SearchBoxProps {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}

export function SearchBox({ value, placeholder, onChange }: SearchBoxProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  };

  return (
    <div className="search-box">
      <input
        value={value}
        onChange={handleChange}
        placeholder={placeholder ?? '按关键词搜索'}
        className="input"
        type="search"
      />
      {value ? (
        <button type="button" className="ghost-button" onClick={() => onChange('')}>
          清空
        </button>
      ) : null}
    </div>
  );
}
