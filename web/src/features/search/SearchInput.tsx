"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
};

export const SearchInput = ({ value, onChange, onSubmit, disabled }: SearchInputProps) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") onSubmit();
  };

  return (
    <div className="flex gap-2">
      <Input
        type="text"
        placeholder="종목명 또는 종목코드 검색"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className="w-full"
      />
      <Button onClick={onSubmit} disabled={disabled}>
        검색
      </Button>
    </div>
  );
};
