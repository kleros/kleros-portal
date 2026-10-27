"use client";

import { useId } from "react";

import { Switch } from "@kleros/ui-components-library";
import { useIsMutating } from "@tanstack/react-query";

import { cn } from "@/utils/cn";

import { turnOffAllMutationKey } from "../hooks/useTurnOffAll";
import { topicCopy, type TopicGroup } from "../model/copy";
import { allOn, countOn, setAll, type TopicChange, type TopicState } from "../model/settings";

/**
 * The library's off track is the stroke colour, under 3:1 against the card (WCAG 1.4.11);
 * secondary text clears it in both themes. The library marks the focused switch's label `data-focus-visible`.
 */
const SWITCH_CLASS = cn(
  "rounded-full data-focus-visible:outline-2 data-focus-visible:outline-offset-2",
  "data-focus-visible:outline-klerosUIComponentsPrimaryBlue",
  "[&:not([data-selected])>span:last-child]:bg-klerosUIComponentsSecondaryText",
);

interface TopicGroupCardProps {
  product: string;
  group: TopicGroup<TopicState>;
  onChange: (changes: TopicChange[]) => void;
}

export function TopicGroupCard({ product, group, onChange }: TopicGroupCardProps) {
  const turningOff = useIsMutating({ mutationKey: turnOffAllMutationKey }) > 0;
  const titleId = useId();
  const on = countOn(group.items);
  const everyOn = allOn(group.items);

  return (
    <section
      aria-labelledby={titleId}
      className="border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground rounded-base overflow-hidden border"
    >
      <div className="border-klerosUIComponentsStroke bg-klerosUIComponentsLightGrey flex items-center justify-between gap-4 border-b px-4 py-3 sm:px-5">
        <h3 id={titleId} className="text-base font-semibold">
          {group.title}
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-klerosUIComponentsSecondaryText text-sm tabular-nums">
            {on} of {group.items.length}
          </span>
          {group.items.length > 1 ? (
            <Switch
              isDisabled={turningOff}
              small
              className={SWITCH_CLASS}
              aria-label={`All ${group.title.toLowerCase()} emails`}
              isSelected={everyOn}
              onChange={() => onChange(setAll(group.items, !everyOn))}
            />
          ) : null}
        </div>
      </div>
      <ul>
        {group.items.map((state) => {
          const { label, hint } = topicCopy(product, state.topic);
          return (
            <li
              key={state.topic}
              className="border-klerosUIComponentsStroke flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0 sm:px-5"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm leading-5">{label}</span>
                {hint ? <span className="text-klerosUIComponentsSecondaryText text-xs leading-4">{hint}</span> : null}
              </div>
              <Switch
                isDisabled={turningOff}
                small
                aria-label={label}
                className={cn("shrink-0", SWITCH_CLASS)}
                isSelected={state.enabled}
                onChange={(enabled) => onChange([{ topic: state.topic, enabled }])}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
