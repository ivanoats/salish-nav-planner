import type { LocationRepository } from "@/application/ports/location-repository";
import type { Location } from "@/domain/location";

export class InMemoryLocationRepository implements LocationRepository {
  private readonly bySlug: ReadonlyMap<string, Location>;

  constructor(private readonly locations: readonly Location[]) {
    this.bySlug = new Map(locations.map((location) => [location.slug, location]));
  }

  list(): readonly Location[] {
    return this.locations;
  }

  find(slug: string): Location | undefined {
    return this.bySlug.get(slug);
  }
}
