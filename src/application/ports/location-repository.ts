import type { Location } from "@/domain/location";

export interface LocationRepository {
  list(): readonly Location[];
  find(slug: string): Location | undefined;
}
