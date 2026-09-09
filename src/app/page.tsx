import { Atlas } from "@/components/atlas";
import { listCategories, listWebsites } from "@/server/catalog";
import { settingsStore } from "@/server/settings";
export const dynamic = "force-dynamic";
export default async function Page() {
  const { settings, warning } = await settingsStore.read();
  return (
    <Atlas
      initialWebsites={listWebsites()}
      initialCategories={listCategories()}
      initialSettings={settings}
      warning={warning}
    />
  );
}
