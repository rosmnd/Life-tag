import markup from "./markup.html?raw";
import { useLifeTag } from "./useLifeTag";

export function Page() {
  useLifeTag();
  return <div id="lifetag" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: markup }} />;
}
