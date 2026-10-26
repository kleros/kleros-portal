"use client";

import { SaveStatusPill } from "./SaveStatusPill";
import { TopicGroupCard } from "./TopicGroupCard";
import { useUpdateTopics } from "../hooks/useUpdateTopics";
import { groupTopics, productCopy } from "../model/copy";
import type { ProductSettings } from "../model/settings";

export function ProductPanel({ entry }: { entry: ProductSettings }) {
  const update = useUpdateTopics(entry.product);
  const { name, description } = productCopy(entry.product);

  return (
    <section aria-labelledby="product-title" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="product-title" className="text-xl font-semibold tracking-tight">
            {name}
          </h2>
          {description ? <p className="text-klerosUIComponentsSecondaryText text-sm">{description}</p> : null}
        </div>
        <SaveStatusPill />
      </div>

      {groupTopics(entry.product, entry.topics).map((group) => (
        <TopicGroupCard
          key={group.id}
          product={entry.product}
          group={group}
          onChange={(changes) => {
            if (changes.length > 0) update.mutate(changes);
          }}
        />
      ))}
    </section>
  );
}
