export type WeekdayAvailabilitySlot = {
  weekday: number;
  startsAt: string;
  endsAt: string;
};

export function hasOverlappingAvailability(
  availability: WeekdayAvailabilitySlot[],
): number | null {
  const byWeekday = new Map<number, WeekdayAvailabilitySlot[]>();

  for (const item of availability) {
    const group = byWeekday.get(item.weekday) ?? [];
    group.push(item);
    byWeekday.set(item.weekday, group);
  }

  for (const [weekday, items] of byWeekday) {
    const sortedItems = [...items].sort((left, right) =>
      left.startsAt.localeCompare(right.startsAt),
    );

    for (let index = 0; index < sortedItems.length - 1; index += 1) {
      if (sortedItems[index].endsAt > sortedItems[index + 1].startsAt) {
        return weekday;
      }
    }
  }

  return null;
}
