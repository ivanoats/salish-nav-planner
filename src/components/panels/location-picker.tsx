"use client";

import { Combobox, createListCollection } from "@ark-ui/react/combobox";
import { useFilter } from "@ark-ui/react/locale";
import { Portal } from "@ark-ui/react/portal";
import { useMemo, useState } from "react";
import { css } from "styled-system/css";
import type { Location } from "@/domain/location";

interface LocationPickerProps {
  readonly label: string;
  readonly locations: readonly Location[];
  readonly value: string | null;
  readonly onChange: (slug: string | null) => void;
}

const REGION_LABEL: Record<Location["region"], string> = {
  US: "United States",
  CA: "Canada",
};

const byName = (locations: readonly Location[]) =>
  [...locations].sort((a, b) => a.name.localeCompare(b.name));

export function LocationPicker({ label, locations, value, onChange }: LocationPickerProps) {
  const { contains } = useFilter({ sensitivity: "base" });
  const [visibleItems, setVisibleItems] = useState<Location[]>(() => byName(locations));

  const collection = useMemo(
    () =>
      createListCollection<Location>({
        items: visibleItems,
        itemToString: (item) => item.name,
        itemToValue: (item) => item.slug,
        groupBy: (item) => REGION_LABEL[item.region],
      }),
    [visibleItems]
  );

  return (
    <Combobox.Root
      collection={collection}
      value={value !== null ? [value] : []}
      onValueChange={(details) => onChange(details.value[0] ?? null)}
      onInputValueChange={(details) => {
        const filtered =
          details.inputValue === ""
            ? locations
            : locations.filter((location) => contains(location.name, details.inputValue));
        setVisibleItems(byName(filtered));
      }}
      className={css({ display: "flex", flexDirection: "column", gap: "1.5", width: "full" })}
    >
      <Combobox.Label className={css({ fontSize: "sm", fontWeight: "medium", color: "fg.muted" })}>
        {label}
      </Combobox.Label>
      <Combobox.Control
        className={css({
          display: "flex",
          alignItems: "center",
          borderWidth: "1px",
          borderColor: "border.default",
          borderRadius: "md",
          backgroundColor: "bg.default",
          paddingX: "3",
          height: "10",
        })}
      >
        <Combobox.Input
          placeholder="Search a harbor, marina, or point…"
          className={css({
            flex: "1",
            fontSize: "sm",
            outline: "none",
            backgroundColor: "transparent",
          })}
        />
        <Combobox.ClearTrigger
          className={css({ fontSize: "sm", color: "fg.muted", cursor: "pointer" })}
        >
          ×
        </Combobox.ClearTrigger>
      </Combobox.Control>
      <Portal>
        <Combobox.Positioner>
          <Combobox.Content
            className={css({
              backgroundColor: "bg.default",
              borderWidth: "1px",
              borderColor: "border.default",
              borderRadius: "md",
              boxShadow: "lg",
              maxHeight: "72",
              overflowY: "auto",
              zIndex: "50",
              paddingY: "1",
            })}
          >
            {collection.group().map(([region, items]) => (
              <Combobox.ItemGroup key={region}>
                <Combobox.ItemGroupLabel
                  className={css({
                    fontSize: "xs",
                    fontWeight: "semibold",
                    color: "fg.muted",
                    paddingX: "3",
                    paddingY: "1",
                    textTransform: "uppercase",
                  })}
                >
                  {region}
                </Combobox.ItemGroupLabel>
                {items.map((item) => (
                  <Combobox.Item
                    key={item.slug}
                    item={item}
                    className={css({
                      paddingX: "3",
                      paddingY: "2",
                      fontSize: "sm",
                      cursor: "pointer",
                      _highlighted: { backgroundColor: "colorPalette.3" },
                    })}
                  >
                    <Combobox.ItemText>{item.name}</Combobox.ItemText>
                  </Combobox.Item>
                ))}
              </Combobox.ItemGroup>
            ))}
            <Combobox.Empty
              className={css({ paddingX: "3", paddingY: "2", fontSize: "sm", color: "fg.muted" })}
            >
              No matches
            </Combobox.Empty>
          </Combobox.Content>
        </Combobox.Positioner>
      </Portal>
    </Combobox.Root>
  );
}
