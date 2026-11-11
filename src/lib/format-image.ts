import { R2_MATCH_CONTENT_DOMAIN } from "@/lib/storage-r2";

export type FormatFlags = {
  board?: string | null;
  ix?: boolean;
  immo?: boolean;
  epic?: boolean;
  baseLeaders?: boolean;
  choam?: boolean;
};

/** Recognizable format filename, e.g. Uprising + Ix + Immortality -> "UpIxImmo.png". */
export function formatImageSlug(f: FormatFlags): string {
  const board = (f.board ?? "uprising").toLowerCase().startsWith("base") ? "Base" : "Up";
  return [board, f.ix && "Ix", f.immo && "Immo", f.epic && "Epic", f.baseLeaders && "BaseL", f.choam && "Choam"]
    .filter(Boolean)
    .join("") + ".png";
}

export const FORMAT_IMAGE_FOLDER = "mode";

export function formatImageUrl(slug: string): string {
  return `${R2_MATCH_CONTENT_DOMAIN}/${FORMAT_IMAGE_FOLDER}/${slug}`;
}
