"use client";

import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Match = {
  label: string;
  index: number;
};

const markClass = "gotechy-search-mark";
const activeClass = "gotechy-search-mark-active";
const ignoredTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "BUTTON"]);

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebouncedValue(query, 180);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const shortcut = (event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "k" || event.key.toLowerCase() === "f");

      if (shortcut) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }

      if (event.key === "Escape") {
        setQuery("");
        inputRef.current?.blur();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    clearMarks();

    const normalized = debouncedQuery.trim();
    if (normalized.length < 2) {
      setMatches([]);
      setActiveIndex(0);
      return;
    }

    const scope = document.querySelector<HTMLElement>("[data-global-search-scope]");
    if (!scope) return;

    const found = highlightMatches(scope, normalized);
    setMatches(found.map((label, index) => ({ label, index })));
    setActiveIndex(0);

    window.setTimeout(() => scrollToMatch(0), 20);

    return clearMarks;
  }, [debouncedQuery]);

  const helper = useMemo(() => {
    if (!query.trim()) return "Ctrl+K";
    if (query.trim().length < 2) return "2+ letras";
    return `${matches.length} resultados`;
  }, [matches.length, query]);

  function goTo(index: number) {
    const next = matches.length ? (index + matches.length) % matches.length : 0;
    setActiveIndex(next);
    scrollToMatch(next);
  }

  return (
    <div className="relative hidden md:block">
      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        ref={inputRef}
        className="h-9 w-72 pl-9 pr-20"
        placeholder="Buscar en esta pantalla"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="absolute right-1 top-1 flex items-center gap-1">
        {query ? (
          <Button aria-label="Limpiar búsqueda" className="h-7 w-7" size="icon" variant="ghost" onClick={() => setQuery("")}>
            <X className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        <span className="rounded border bg-muted px-1.5 py-1 text-[10px] text-muted-foreground">{helper}</span>
      </div>
      {matches.length ? (
        <div className="absolute right-0 top-11 z-40 w-80 rounded-lg border bg-card p-2 shadow-lg">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Resultado {activeIndex + 1} de {matches.length}
            </span>
            <div className="flex gap-1">
              <Button className="h-7 px-2" size="sm" variant="ghost" onClick={() => goTo(activeIndex - 1)}>
                Anterior
              </Button>
              <Button className="h-7 px-2" size="sm" variant="ghost" onClick={() => goTo(activeIndex + 1)}>
                Siguiente
              </Button>
            </div>
          </div>
          <button className="w-full truncate rounded-md bg-muted px-2 py-1.5 text-left text-xs" type="button" onClick={() => goTo(activeIndex)}>
            {matches[activeIndex]?.label}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debounced;
}

function clearMarks() {
  document.querySelectorAll(`mark.${markClass}`).forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(mark.textContent ?? ""), mark);
    parent.normalize();
  });
}

function highlightMatches(root: HTMLElement, query: string) {
  const labels: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      const text = node.textContent ?? "";
      if (!parent || ignoredTags.has(parent.tagName) || !text.toLowerCase().includes(query.toLowerCase())) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes: Text[] = [];

  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }

  for (const node of nodes) {
    const text = node.textContent ?? "";
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let index = lowerText.indexOf(lowerQuery);

    while (index >= 0) {
      fragment.append(document.createTextNode(text.slice(cursor, index)));
      const mark = document.createElement("mark");
      mark.className = markClass;
      mark.textContent = text.slice(index, index + query.length);
      fragment.append(mark);
      labels.push(text.trim().replace(/\s+/g, " ").slice(0, 90));
      cursor = index + query.length;
      index = lowerText.indexOf(lowerQuery, cursor);
    }

    fragment.append(document.createTextNode(text.slice(cursor)));
    node.parentNode?.replaceChild(fragment, node);
  }

  return labels;
}

function scrollToMatch(index: number) {
  const marks = Array.from(document.querySelectorAll<HTMLElement>(`mark.${markClass}`));
  marks.forEach((mark) => mark.classList.remove(activeClass));
  const mark = marks[index];
  if (!mark) return;
  mark.classList.add(activeClass);
  mark.scrollIntoView({ behavior: "smooth", block: "center" });
}
