"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  constructionTechnologyCatalog,
  constructionTechnologySources,
  getConstructionTechnologyStages,
  requiresTechnologyOptionDescription,
  type ConstructionTechnologyKey,
  type ConstructionTechnologySelections,
  type ConstructionWorkType,
  type TechnologyStage,
} from "@asystent/schemas";

export function TechnologyQuestionnaire({
  workType,
  selections,
  onChange,
  onOtherDescriptionChange,
}: {
  workType: ConstructionWorkType;
  selections: ConstructionTechnologySelections;
  onChange: (key: ConstructionTechnologyKey, value: string | string[] | null) => void;
  onOtherDescriptionChange: (key: ConstructionTechnologyKey, value: string) => void;
}) {
  const groups = useMemo(() => {
    const grouped = new Map<string, ConstructionTechnologyKey[]>();
    for (const key of getConstructionTechnologyStages(workType, selections)) {
      const section = constructionTechnologyCatalog[key].section;
      grouped.set(section, [...(grouped.get(section) ?? []), key]);
    }
    return grouped;
  }, [workType, selections]);

  return <div className="technology-questionnaire">
    <p className="technology-guidance">
      {workType === "other"
        ? "Opisz konkretnie prace w polu „Opis prac do wykonania” i zaznacz co najmniej jedną pasującą kategorię. Sama informacja „zgodnie z projektem” nie zastępuje opisu zakresu."
        : "Wybór opisuje preferencje inwestora, a nie projekt techniczny. Rozwiązanie i jego wykonanie muszą być każdorazowo zgodne z aktualną dokumentacją, warunkami gruntowymi, przepisami oraz zaleceniami projektanta i kierownika budowy. Jeśli nie znasz rozwiązania, wybierz „Zgodnie z projektem”."}
    </p>
    {[...groups.entries()].map(([section, keys]) => <section className="technology-section" key={section}>
      <h3>{section}</h3>
      <div className="technology-fields">
        {keys.map((key) => {
          const stage: TechnologyStage = constructionTechnologyCatalog[key];
          const value = selections[key];
          const selected = Array.isArray(value) ? value : value ? [value] : [];
          const hasOther = selected.some((item) => requiresTechnologyOptionDescription(key, item));
          return <SearchableTechnologySelect
            key={key}
            stageKey={key}
            label={stage.label}
            help={stage.help}
            options={stage.options}
            value={value}
            multiple={stage.multiple === true}
            otherDescription={selections.otherDescriptions[key] ?? ""}
            onChange={(nextValue) => onChange(key, nextValue)}
            onOtherDescriptionChange={(text) => onOtherDescriptionChange(key, text)}
            showOtherDescription={hasOther}
          />;
        })}
      </div>
    </section>)}
    <p className="technology-catalog-note">
      {workType === "other"
        ? "Lista obejmuje popularne technologie. Wybór i sposób wykonania należy zweryfikować z dokumentacją oraz zasadami wiedzy technicznej."
        : "Lista obejmuje popularne rozwiązania i wariant „zgodnie z projektem”; nie zastępuje specyfikacji producenta ani projektu konkretnego budynku."}
    </p>
    <ul className="technology-sources" aria-label="Źródła katalogu technologii">
      <li>Źródła katalogu:</li>
      {constructionTechnologySources.map((source) => <li key={source.url}>
        <a href={source.url} target="_blank" rel="noreferrer">{source.label}</a>
      </li>)}
    </ul>
  </div>;
}

function SearchableTechnologySelect({
  stageKey,
  label,
  help,
  options,
  value,
  multiple,
  otherDescription,
  onChange,
  onOtherDescriptionChange,
  showOtherDescription,
}: {
  stageKey: ConstructionTechnologyKey;
  label: string;
  help: string;
  options: readonly { value: string; label: string }[];
  value: string | string[] | null;
  multiple: boolean;
  otherDescription: string;
  onChange: (value: string | string[] | null) => void;
  onOtherDescriptionChange: (value: string) => void;
  showOtherDescription: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const selectedValues = Array.isArray(value) ? value : value ? [value] : [];
  const selectedLabels = selectedValues
    .map((selected) => options.find((option) => option.value === selected)?.label)
    .filter((item): item is string => !!item);
  const matchingOptions = options.filter((option) =>
    option.label.toLocaleLowerCase("pl-PL").includes(search.trim().toLocaleLowerCase("pl-PL")),
  );
  const listboxId = `technology-options-${stageKey}`;

  useEffect(() => {
    if (open) searchInput.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  function choose(optionValue: string) {
    if (multiple) {
      const next = selectedValues.includes(optionValue)
        ? selectedValues.filter((item) => item !== optionValue)
        : [...selectedValues, optionValue];
      onChange(next);
      return;
    }
    onChange(optionValue);
    setOpen(false);
    setSearch("");
    trigger.current?.focus();
  }

  function closeFromKeyboard() {
    setOpen(false);
    trigger.current?.focus();
  }

  return <div className="technology-field" data-technology-stage={stageKey} ref={root}>
    <span className="technology-field-label" id={`technology-label-${stageKey}`}>{label}</span>
    <div className="technology-select-control">
      <button
        ref={trigger}
        type="button"
        className="technology-select-trigger"
        role="combobox"
        aria-labelledby={`technology-label-${stageKey}`}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") closeFromKeyboard();
        }}
      >
        <span className={selectedLabels.length ? "" : "technology-select-placeholder"}>
          {selectedLabels.length
            ? multiple
              ? `Wybrano: ${selectedLabels.join(", ")}`
              : selectedLabels[0]
            : "Wybierz technologię…"}
        </span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && <div className="technology-select-menu">
        <label className="technology-select-search-label" htmlFor={`technology-search-${stageKey}`}>Szukaj: {label}</label>
        <input
          ref={searchInput}
          id={`technology-search-${stageKey}`}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`Wpisz, aby znaleźć: ${label.toLocaleLowerCase("pl-PL")}`}
          autoComplete="off"
          onKeyDown={(event) => {
            if (event.key === "Escape") closeFromKeyboard();
          }}
        />
        <div id={listboxId} className="technology-option-list" role="listbox" aria-multiselectable={multiple || undefined} aria-label={label}>
          {matchingOptions.length ? matchingOptions.map((option) => {
            const selected = selectedValues.includes(option.value);
            return <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={selected}
              className="technology-option"
              onClick={() => choose(option.value)}
            >
              {multiple && <span className="technology-option-check" aria-hidden="true">{selected ? "✓" : ""}</span>}
              <span>{option.label}</span>
            </button>;
          }) : <p className="technology-empty-search">Brak pasujących pozycji.</p>}
        </div>
        <small aria-live="polite">{matchingOptions.length} pozycji na liście</small>
        {multiple && selectedValues.length > 0 && <button type="button" className="technology-clear-button" onClick={() => onChange([])}>
          Wyczyść wybrane ({selectedValues.length})
        </button>}
      </div>}
    </div>
    <small>{multiple ? `Możesz zaznaczyć kilka opcji. ${help}` : help}</small>
    {showOtherDescription && <label className="technology-other-description">
      Opisz wybraną opcję „Inne” — {label}
      <textarea
        value={otherDescription}
        onChange={(event) => onOtherDescriptionChange(event.target.value)}
        maxLength={500}
        rows={2}
        required
      />
    </label>}
  </div>;
}
