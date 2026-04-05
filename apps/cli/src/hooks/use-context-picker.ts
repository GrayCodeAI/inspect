import { useState, useCallback, useRef } from "react";

export interface ContextPickerOption {
  id: string;
  label: string;
  description?: string;
  type: "pr" | "branch" | "commit" | "file";
}

export interface UseContextPickerOptions {
  options: ContextPickerOption[];
  onSelect?: (option: ContextPickerOption) => void;
  onClose?: () => void;
}

export interface UseContextPickerResult {
  isOpen: boolean;
  query: string;
  filteredOptions: ContextPickerOption[];
  selectedIndex: number;
  openPicker: (query?: string) => void;
  closePicker: () => void;
  setQuery: (query: string) => void;
  setSelectedIndex: (index: number) => void;
  selectCurrent: () => void;
  handlePickerKey: (
    input: string,
    key: { upArrow?: boolean; downArrow?: boolean; return?: boolean; escape?: boolean },
  ) => boolean;
}

export function useContextPicker({
  options,
  onSelect,
  onClose,
}: UseContextPickerOptions): UseContextPickerResult {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const optionsRef = useRef(options);
  optionsRef.current = options;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const filteredOptions = options.filter(
    (opt) =>
      query.length === 0 ||
      opt.label.toLowerCase().includes(query.toLowerCase()) ||
      opt.description?.toLowerCase().includes(query.toLowerCase()),
  );

  const openPicker = useCallback((initialQuery = "") => {
    setQuery(initialQuery);
    setSelectedIndex(0);
    setIsOpen(true);
  }, []);

  const closePicker = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setSelectedIndex(0);
    onCloseRef.current?.();
  }, []);

  const selectCurrent = useCallback(() => {
    const selected = optionsRef.current.filter(
      (opt) =>
        query.length === 0 ||
        opt.label.toLowerCase().includes(query.toLowerCase()) ||
        opt.description?.toLowerCase().includes(query.toLowerCase()),
    )[selectedIndex];
    if (selected) {
      onSelectRef.current?.(selected);
      closePicker();
    }
  }, [selectedIndex, query]);

  const handlePickerKey = useCallback(
    (
      input: string,
      key: { upArrow?: boolean; downArrow?: boolean; return?: boolean; escape?: boolean },
    ): boolean => {
      if (!isOpen) return false;

      if (key.escape) {
        closePicker();
        return true;
      }

      if (key.return) {
        selectCurrent();
        return true;
      }

      if (key.upArrow) {
        setSelectedIndex((i) => Math.max(0, i - 1));
        return true;
      }

      if (key.downArrow) {
        setSelectedIndex((i) => Math.min(filteredOptions.length - 1, i + 1));
        return true;
      }

      if (input && !key.upArrow && !key.downArrow && !key.return && !key.escape) {
        setQuery((q) => q + input);
        setSelectedIndex(0);
        return true;
      }

      return false;
    },
    [isOpen, closePicker, selectCurrent, filteredOptions.length],
  );

  return {
    isOpen,
    query,
    filteredOptions,
    selectedIndex,
    openPicker,
    closePicker,
    setQuery,
    setSelectedIndex,
    selectCurrent,
    handlePickerKey,
  } as const;
}
